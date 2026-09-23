mod storage;

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{SecondsFormat, Utc};
use reqwest::{redirect::Policy, Client, Method, Response, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, State, Webview};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use self::storage::{NativeSecretStore, SecretStore};
use crate::view_mode::require_local_shell;

const GITHUB_API_ORIGIN: &str = "https://api.github.com";
const GITHUB_OAUTH_ORIGIN: &str = "https://github.com";
const GITHUB_API_VERSION: &str = "2026-03-10";
const DEVICE_PAGE_URL: &str = "https://github.com/login/device";
const ACTIONS_PAGE_URL: &str = "https://github.com/DanielBrindusa/ArtaGatitului/actions";
const REPOSITORY_OWNER: &str = "DanielBrindusa";
const REPOSITORY_NAME: &str = "ArtaGatitului";
const REPOSITORY_FULL_NAME: &str = "DanielBrindusa/ArtaGatitului";
const REPOSITORY_ID: u64 = 1_256_031_473;
const PUBLISH_BRANCH: &str = "main";
const MAX_RECIPE_JSON_BYTES: usize = 750_000;
const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const MIN_IMAGE_DIMENSION: usize = 320;
const MAX_IMAGE_DIMENSION: usize = 8_000;
const TOKEN_REFRESH_MARGIN_SECONDS: i64 = 300;
const MAX_PLAN_AGE_SECONDS: i64 = 15 * 60;

const RECIPE_SOURCE_KEYS: &[&str] = &[
    "id",
    "slug",
    "title",
    "name",
    "description",
    "category",
    "ingredients",
    "steps",
    "preparation",
    "beforeStart",
    "tags",
    "equipment",
    "prepTimeMinutes",
    "cookTimeMinutes",
    "totalTimeMinutes",
    "servings",
    "image",
    "sourceUrl",
    "createdAt",
    "updatedAt",
    "status",
    "closing",
    "extras",
    "ratingSummary",
    "keywords",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubConnectionStatus {
    available: bool,
    configured: bool,
    connected: bool,
    repository_verified: bool,
    repository: String,
    branch: String,
    token_expires_at: Option<String>,
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlowStart {
    user_code: String,
    verification_uri: String,
    expires_at: String,
    interval_seconds: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlowPoll {
    state: String,
    retry_after_seconds: Option<u64>,
    message: Option<String>,
    connection: Option<GitHubConnectionStatus>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishImageInput {
    bytes_base64: String,
    mime_type: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparePublishInput {
    source_draft_id: String,
    slug: String,
    title: String,
    recipe_json: String,
    image: Option<PublishImageInput>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishReview {
    plan_id: String,
    recipe_title: String,
    recipe_slug: String,
    repository: String,
    branch: String,
    base_commit_sha: String,
    files: Vec<String>,
    checks: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    commit_sha: String,
    branch: String,
    repository: String,
    source_draft_id: String,
    recipe_slug: String,
    image_path: Option<String>,
    published_at: String,
    deployment_status: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct TokenBundle {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
    refresh_token_expires_at: i64,
}

#[derive(Clone)]
struct PendingDeviceFlow {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_at: i64,
    interval_seconds: u64,
    next_poll_at: i64,
}

#[derive(Clone)]
struct PublicationFile {
    path: String,
    bytes: Vec<u8>,
    encoding: BlobEncoding,
}

#[derive(Clone, Copy)]
enum BlobEncoding {
    Utf8,
    Base64,
}

#[derive(Clone)]
struct PendingPublishPlan {
    id: String,
    source_draft_id: String,
    recipe_title: String,
    recipe_slug: String,
    base_commit_sha: String,
    base_tree_sha: String,
    files: Vec<PublicationFile>,
    image_path: Option<String>,
    created_at: i64,
}

#[derive(Clone)]
struct VerifiedRepository {
    branch: String,
}

pub struct GithubState {
    api_client: Client,
    oauth_client: Client,
    secrets: Arc<dyn SecretStore>,
    secure_storage_error: Option<String>,
    client_id: Option<String>,
    pending_device_flow: Mutex<Option<PendingDeviceFlow>>,
    pending_publish: Mutex<Option<PendingPublishPlan>>,
    credential_lock: Mutex<()>,
    refresh_lock: tokio::sync::Mutex<()>,
    publishing: AtomicBool,
}

struct PublishingGuard<'a>(&'a AtomicBool);

impl Drop for PublishingGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    refresh_token_expires_in: Option<i64>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct InstallationsResponse {
    installations: Vec<Installation>,
}

#[derive(Deserialize)]
struct Installation {
    id: u64,
    account: InstallationAccount,
    permissions: HashMap<String, String>,
    repository_selection: String,
    suspended_at: Option<String>,
}

#[derive(Deserialize)]
struct InstallationAccount {
    login: String,
}

#[derive(Deserialize)]
struct RepositoriesResponse {
    repositories: Vec<RepositorySummary>,
}

#[derive(Deserialize)]
struct RepositorySummary {
    id: u64,
    full_name: String,
    permissions: Option<RepositoryPermissions>,
}

#[derive(Deserialize)]
struct RepositoryPermissions {
    push: bool,
}

#[derive(Deserialize)]
struct RepositoryDetails {
    id: u64,
    full_name: String,
    default_branch: String,
    permissions: Option<RepositoryPermissions>,
}

#[derive(Deserialize)]
struct GitReference {
    object: GitObject,
}

#[derive(Deserialize)]
struct GitObject {
    sha: String,
}

#[derive(Deserialize)]
struct GitCommit {
    tree: GitObject,
}

#[derive(Deserialize)]
struct CreatedGitObject {
    sha: String,
}

impl GithubState {
    pub fn new(secure_storage_error: Option<String>) -> Result<Self, String> {
        let api_client = Client::builder()
            .timeout(Duration::from_secs(25))
            .redirect(Policy::custom(|attempt| {
                let url = attempt.url();
                if attempt.previous().len() < 3
                    && url.scheme() == "https"
                    && url.host_str() == Some("api.github.com")
                    && matches!(url.port(), None | Some(443))
                {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
            .map_err(|_| "The GitHub HTTP client could not be initialized.".to_string())?;
        let oauth_client = Client::builder()
            .timeout(Duration::from_secs(25))
            .redirect(Policy::none())
            .build()
            .map_err(|_| "The GitHub authorization client could not be initialized.".to_string())?;
        let client_id = option_env!("ARTA_GITHUB_APP_CLIENT_ID")
            .map(str::trim)
            .filter(|value| valid_client_id(value))
            .map(ToOwned::to_owned);

        Ok(Self {
            api_client,
            oauth_client,
            secrets: Arc::new(NativeSecretStore),
            secure_storage_error,
            client_id,
            pending_device_flow: Mutex::new(None),
            pending_publish: Mutex::new(None),
            credential_lock: Mutex::new(()),
            refresh_lock: tokio::sync::Mutex::new(()),
            publishing: AtomicBool::new(false),
        })
    }

    #[cfg(test)]
    fn for_test(secrets: Arc<dyn SecretStore>) -> Self {
        Self {
            api_client: Client::new(),
            oauth_client: Client::new(),
            secrets,
            secure_storage_error: None,
            client_id: Some("Iv1.test-client-id".to_string()),
            pending_device_flow: Mutex::new(None),
            pending_publish: Mutex::new(None),
            credential_lock: Mutex::new(()),
            refresh_lock: tokio::sync::Mutex::new(()),
            publishing: AtomicBool::new(false),
        }
    }

    fn availability_status(&self) -> Option<GitHubConnectionStatus> {
        if let Some(message) = &self.secure_storage_error {
            return Some(connection_status(
                false,
                false,
                false,
                None,
                Some(message.clone()),
            ));
        }
        if self.client_id.is_none() {
            return Some(connection_status(
                true,
                false,
                false,
                None,
                Some(
                    "Configure ARTA_GITHUB_APP_CLIENT_ID and rebuild the application.".to_string(),
                ),
            ));
        }
        None
    }

    fn load_token_bundle(&self) -> Result<Option<TokenBundle>, String> {
        let _guard = self
            .credential_lock
            .lock()
            .map_err(|_| "Secure GitHub credential storage is busy.".to_string())?;
        let Some(serialized) = self.secrets.load()? else {
            return Ok(None);
        };
        match serde_json::from_str::<TokenBundle>(&serialized) {
            Ok(bundle) if !bundle.access_token.is_empty() && !bundle.refresh_token.is_empty() => {
                Ok(Some(bundle))
            }
            _ => {
                self.secrets.delete()?;
                Err("Stored GitHub authorization is invalid. Connect GitHub again.".to_string())
            }
        }
    }

    fn save_token_bundle(&self, bundle: &TokenBundle) -> Result<(), String> {
        let serialized = serde_json::to_string(bundle)
            .map_err(|_| "GitHub authorization could not be secured.".to_string())?;
        let _guard = self
            .credential_lock
            .lock()
            .map_err(|_| "Secure GitHub credential storage is busy.".to_string())?;
        self.secrets.save(&serialized)
    }

    fn delete_token_bundle(&self) -> Result<(), String> {
        let _guard = self
            .credential_lock
            .lock()
            .map_err(|_| "Secure GitHub credential storage is busy.".to_string())?;
        self.secrets.delete()
    }

    async fn load_ready_token_bundle(&self) -> Result<Option<TokenBundle>, String> {
        let _guard = self.refresh_lock.lock().await;
        let Some(bundle) = self.load_token_bundle()? else {
            return Ok(None);
        };
        if !token_needs_refresh(&bundle, now_seconds()) {
            return Ok(Some(bundle));
        }
        self.refresh_token(bundle).await.map(Some)
    }

    async fn ready_access_token(&self) -> Result<TokenBundle, String> {
        self.load_ready_token_bundle()
            .await?
            .ok_or_else(|| "Connect GitHub before publishing.".to_string())
    }

    async fn refresh_token(&self, previous: TokenBundle) -> Result<TokenBundle, String> {
        if previous.refresh_token_expires_at <= now_seconds() {
            self.delete_token_bundle()?;
            return Err("GitHub authorization expired. Connect GitHub again.".to_string());
        }
        let client_id = self
            .client_id
            .as_deref()
            .ok_or_else(|| "The GitHub App Client ID is not configured.".to_string())?;
        let response = self
            .oauth_client
            .post(format!("{GITHUB_OAUTH_ORIGIN}/login/oauth/access_token"))
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
                ("grant_type", "refresh_token"),
                ("refresh_token", previous.refresh_token.as_str()),
            ])
            .send()
            .await
            .map_err(|_| "GitHub could not be reached to refresh authorization.".to_string())?;
        let result = parse_oauth_response(response).await?;
        if let Some(error) = result.error.as_deref() {
            if matches!(error, "bad_refresh_token" | "incorrect_client_credentials") {
                self.delete_token_bundle()?;
            }
            return Err(oauth_error_message(
                error,
                result.error_description.as_deref(),
            ));
        }
        let bundle = token_bundle_from_response(&result, now_seconds())?;
        self.save_token_bundle(&bundle)?;
        Ok(bundle)
    }

    fn api_request(&self, method: Method, path: &str, token: &str) -> reqwest::RequestBuilder {
        self.api_client
            .request(method, format!("{GITHUB_API_ORIGIN}{path}"))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header("User-Agent", "ArtaGatitului-CMS")
            .bearer_auth(token)
    }

    async fn verify_repository(&self, token: &str) -> Result<VerifiedRepository, String> {
        let installations: InstallationsResponse = read_api_json(
            self.api_request(Method::GET, "/user/installations?per_page=100", token)
                .send()
                .await
                .map_err(|_| "GitHub repository access could not be checked.".to_string())?,
            "GitHub App installations could not be checked.",
        )
        .await?;
        let installation_id = select_repository_installation(&installations)?;
        let repositories: RepositoriesResponse = read_api_json(
            self.api_request(
                Method::GET,
                &format!("/user/installations/{installation_id}/repositories?per_page=100"),
                token,
            )
            .send()
            .await
            .map_err(|_| "GitHub repository access could not be checked.".to_string())?,
            "The GitHub App repository selection could not be checked.",
        )
        .await?;
        verify_repository_selection(&repositories)?;

        let details: RepositoryDetails = read_api_json(
            self.api_request(
                Method::GET,
                &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}"),
                token,
            )
            .send()
            .await
            .map_err(|_| "The target GitHub repository could not be reached.".to_string())?,
            "The target GitHub repository could not be verified.",
        )
        .await?;
        verify_repository_details(&details)?;
        Ok(VerifiedRepository {
            branch: details.default_branch,
        })
    }

    async fn current_ref(&self, token: &str) -> Result<String, String> {
        let reference: GitReference = read_api_json(
            self.api_request(
                Method::GET,
                &format!(
                    "/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/ref/heads/{PUBLISH_BRANCH}"
                ),
                token,
            )
            .send()
            .await
            .map_err(|_| "The latest repository state could not be fetched.".to_string())?,
            "The publishing branch could not be read.",
        )
        .await?;
        Ok(reference.object.sha)
    }

    async fn commit_tree(&self, token: &str, commit_sha: &str) -> Result<String, String> {
        let commit: GitCommit = read_api_json(
            self.api_request(
                Method::GET,
                &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/commits/{commit_sha}"),
                token,
            )
            .send()
            .await
            .map_err(|_| "The current Git tree could not be fetched.".to_string())?,
            "The current Git tree could not be read.",
        )
        .await?;
        Ok(commit.tree.sha)
    }

    async fn path_exists(&self, token: &str, path: &str, reference: &str) -> Result<bool, String> {
        let response = self
            .api_request(
                Method::GET,
                &format!(
                    "/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/contents/{path}?ref={reference}"
                ),
                token,
            )
            .send()
            .await
            .map_err(|_| "Repository paths could not be checked.".to_string())?;
        match response.status() {
            StatusCode::OK => Ok(true),
            StatusCode::NOT_FOUND => Ok(false),
            _ => Err(api_status_message(
                response.status(),
                "Repository paths could not be checked.",
            )),
        }
    }

    async fn create_blob(&self, token: &str, file: &PublicationFile) -> Result<String, String> {
        let (content, encoding) = match file.encoding {
            BlobEncoding::Utf8 => (
                String::from_utf8(file.bytes.clone())
                    .map_err(|_| "Recipe JSON must be valid UTF-8.".to_string())?,
                "utf-8",
            ),
            BlobEncoding::Base64 => (BASE64.encode(&file.bytes), "base64"),
        };
        let created: CreatedGitObject = read_api_json(
            self.api_request(
                Method::POST,
                &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/blobs"),
                token,
            )
            .json(&json!({ "content": content, "encoding": encoding }))
            .send()
            .await
            .map_err(|_| "A publication blob could not be created.".to_string())?,
            "A publication blob could not be created.",
        )
        .await?;
        Ok(created.sha)
    }
}

pub fn initialize_secure_storage() -> Result<(), String> {
    storage::initialize_native_store()
}

#[tauri::command]
pub async fn github_get_connection_status(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<GitHubConnectionStatus, String> {
    require_local_shell(&caller)?;
    connection_status_for_state(&state).await
}

#[tauri::command]
pub async fn github_begin_device_flow(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<DeviceFlowStart, String> {
    require_local_shell(&caller)?;
    if let Some(status) = state.availability_status() {
        return Err(status
            .message
            .unwrap_or_else(|| "GitHub publishing is unavailable.".to_string()));
    }
    let client_id = state
        .client_id
        .as_deref()
        .ok_or_else(|| "The GitHub App Client ID is not configured.".to_string())?;
    let response = state
        .oauth_client
        .post(format!("{GITHUB_OAUTH_ORIGIN}/login/device/code"))
        .header("Accept", "application/json")
        .form(&[("client_id", client_id)])
        .send()
        .await
        .map_err(|_| "GitHub could not be reached to start device authorization.".to_string())?;
    if !response.status().is_success() {
        return Err("GitHub rejected the device authorization request.".to_string());
    }
    let value = response
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|_| "GitHub returned an invalid device authorization response.".to_string())?;
    if value.verification_uri != DEVICE_PAGE_URL
        || value.user_code.trim().is_empty()
        || value.device_code.trim().is_empty()
        || value.expires_in == 0
        || value.interval == 0
    {
        return Err("GitHub returned an unsafe device authorization response.".to_string());
    }
    let now = now_seconds();
    let pending = PendingDeviceFlow {
        device_code: value.device_code,
        user_code: value.user_code,
        verification_uri: value.verification_uri,
        expires_at: now + value.expires_in as i64,
        interval_seconds: value.interval,
        next_poll_at: now + value.interval as i64,
    };
    let output = DeviceFlowStart {
        user_code: pending.user_code.clone(),
        verification_uri: pending.verification_uri.clone(),
        expires_at: iso_from_seconds(pending.expires_at),
        interval_seconds: pending.interval_seconds,
    };
    *state
        .pending_device_flow
        .lock()
        .map_err(|_| "The device authorization state is unavailable.".to_string())? = Some(pending);
    Ok(output)
}

#[tauri::command]
pub async fn github_poll_device_flow(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<DeviceFlowPoll, String> {
    require_local_shell(&caller)?;
    let now = now_seconds();
    let pending = state
        .pending_device_flow
        .lock()
        .map_err(|_| "The device authorization state is unavailable.".to_string())?
        .clone()
        .ok_or_else(|| "Start GitHub device authorization first.".to_string())?;
    if now >= pending.expires_at {
        clear_device_flow(&state)?;
        return Ok(device_poll(
            "expired",
            None,
            Some("The GitHub code expired. Start again."),
        ));
    }
    if now < pending.next_poll_at {
        return Ok(device_poll(
            "pending",
            Some((pending.next_poll_at - now) as u64),
            None,
        ));
    }
    let client_id = state
        .client_id
        .as_deref()
        .ok_or_else(|| "The GitHub App Client ID is not configured.".to_string())?;
    let repository_id = REPOSITORY_ID.to_string();
    let response = state
        .oauth_client
        .post(format!("{GITHUB_OAUTH_ORIGIN}/login/oauth/access_token"))
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", pending.device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("repository_id", repository_id.as_str()),
        ])
        .send()
        .await
        .map_err(|_| "GitHub could not be reached while waiting for authorization.".to_string())?;
    let result = parse_oauth_response(response).await?;
    if let Some(error) = result.error.as_deref() {
        match error {
            "authorization_pending" => {
                let interval =
                    update_poll_interval(&state, pending.interval_seconds, result.interval, false)?;
                return Ok(device_poll("pending", Some(interval), None));
            }
            "slow_down" => {
                let interval =
                    update_poll_interval(&state, pending.interval_seconds, result.interval, true)?;
                return Ok(device_poll("slowDown", Some(interval), None));
            }
            "expired_token" | "bad_verification_code" | "incorrect_device_code" => {
                clear_device_flow(&state)?;
                return Ok(device_poll(
                    "expired",
                    None,
                    Some("The GitHub code expired. Start again."),
                ));
            }
            "access_denied" => {
                clear_device_flow(&state)?;
                return Ok(device_poll(
                    "denied",
                    None,
                    Some("GitHub authorization was cancelled."),
                ));
            }
            _ => {
                clear_device_flow(&state)?;
                return Err(oauth_error_message(
                    error,
                    result.error_description.as_deref(),
                ));
            }
        }
    }
    let bundle = token_bundle_from_response(&result, now)?;
    state.save_token_bundle(&bundle)?;
    clear_device_flow(&state)?;
    let connection = match state.verify_repository(&bundle.access_token).await {
        Ok(repository) => connection_status(
            true,
            true,
            true,
            Some(iso_from_seconds(bundle.expires_at)),
            Some(format!("Ready to publish to {}.", repository.branch)),
        ),
        Err(message) => connection_status(
            true,
            true,
            false,
            Some(iso_from_seconds(bundle.expires_at)),
            Some(message),
        ),
    };
    Ok(DeviceFlowPoll {
        state: "connected".to_string(),
        retry_after_seconds: None,
        message: connection.message.clone(),
        connection: Some(connection),
    })
}

#[tauri::command]
pub fn github_cancel_device_flow(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<(), String> {
    require_local_shell(&caller)?;
    clear_device_flow(&state)
}

#[tauri::command]
pub fn github_open_device_page(caller: Webview, app: AppHandle) -> Result<(), String> {
    require_local_shell(&caller)?;
    app.opener()
        .open_url(DEVICE_PAGE_URL, None::<&str>)
        .map_err(|_| "The system browser could not be opened.".to_string())
}

#[tauri::command]
pub fn github_open_actions_page(caller: Webview, app: AppHandle) -> Result<(), String> {
    require_local_shell(&caller)?;
    app.opener()
        .open_url(ACTIONS_PAGE_URL, None::<&str>)
        .map_err(|_| "The GitHub Actions page could not be opened.".to_string())
}

#[tauri::command]
pub fn github_disconnect(caller: Webview, state: State<'_, GithubState>) -> Result<(), String> {
    require_local_shell(&caller)?;
    clear_device_flow(&state)?;
    *state
        .pending_publish
        .lock()
        .map_err(|_| "The publication state is unavailable.".to_string())? = None;
    state.delete_token_bundle()
}

#[tauri::command]
pub async fn github_prepare_recipe_publish(
    caller: Webview,
    state: State<'_, GithubState>,
    input: PreparePublishInput,
) -> Result<PublishReview, String> {
    require_local_shell(&caller)?;
    if state.publishing.load(Ordering::Acquire) {
        return Err("A recipe publication is already in progress.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    let repository = state.verify_repository(&bundle.access_token).await?;
    let (files, image_path) = build_publication_files(&input)?;
    let base_commit_sha = state.current_ref(&bundle.access_token).await?;
    let base_tree_sha = state
        .commit_tree(&bundle.access_token, &base_commit_sha)
        .await?;
    for file in &files {
        if state
            .path_exists(&bundle.access_token, &file.path, &base_commit_sha)
            .await?
        {
            if file.path.starts_with("src/content/recipes/") {
                return Err("A published recipe with this slug already exists.".to_string());
            }
            return Err(format!("The repository path {} already exists.", file.path));
        }
    }

    let plan = PendingPublishPlan {
        id: Uuid::new_v4().to_string(),
        source_draft_id: input.source_draft_id,
        recipe_title: input.title,
        recipe_slug: input.slug,
        base_commit_sha,
        base_tree_sha,
        files,
        image_path,
        created_at: now_seconds(),
    };
    let review = review_from_plan(&plan, &repository.branch);
    *state
        .pending_publish
        .lock()
        .map_err(|_| "The publication review could not be stored.".to_string())? = Some(plan);
    Ok(review)
}

#[tauri::command]
pub async fn github_publish_recipe(
    caller: Webview,
    state: State<'_, GithubState>,
    plan_id: String,
) -> Result<PublishResult, String> {
    require_local_shell(&caller)?;
    if state
        .publishing
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A recipe publication is already in progress.".to_string());
    }
    let _guard = PublishingGuard(&state.publishing);
    let plan = state
        .pending_publish
        .lock()
        .map_err(|_| "The publication review is unavailable.".to_string())?
        .clone()
        .filter(|candidate| candidate.id == plan_id)
        .ok_or_else(|| {
            "This publication review is no longer valid. Review the recipe again.".to_string()
        })?;
    if now_seconds() - plan.created_at > MAX_PLAN_AGE_SECONDS {
        clear_publish_plan(&state)?;
        return Err(
            "This publication review expired. Review the latest repository state again."
                .to_string(),
        );
    }
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let latest_ref = state.current_ref(&bundle.access_token).await?;
    if latest_ref != plan.base_commit_sha {
        clear_publish_plan(&state)?;
        return Err("The repository changed while you were publishing. Refresh the review and confirm again.".to_string());
    }
    for file in &plan.files {
        if state
            .path_exists(&bundle.access_token, &file.path, &latest_ref)
            .await?
        {
            clear_publish_plan(&state)?;
            return Err("A published recipe with this slug already exists.".to_string());
        }
    }

    let mut tree_entries = Vec::with_capacity(plan.files.len());
    for file in &plan.files {
        let sha = state.create_blob(&bundle.access_token, file).await?;
        tree_entries.push(json!({
            "path": file.path,
            "mode": "100644",
            "type": "blob",
            "sha": sha,
        }));
    }
    let tree: CreatedGitObject = read_api_json(
        state
            .api_request(
                Method::POST,
                &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/trees"),
                &bundle.access_token,
            )
            .json(&json!({ "base_tree": plan.base_tree_sha, "tree": tree_entries }))
            .send()
            .await
            .map_err(|_| "The publication tree could not be created.".to_string())?,
        "The publication tree could not be created.",
    )
    .await?;
    let commit: CreatedGitObject = read_api_json(
        state
            .api_request(
                Method::POST,
                &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/commits"),
                &bundle.access_token,
            )
            .json(&json!({
                "message": format!("cms: add recipe {}", plan.recipe_slug),
                "tree": tree.sha,
                "parents": [plan.base_commit_sha],
            }))
            .send()
            .await
            .map_err(|_| "The publication commit could not be created.".to_string())?,
        "The publication commit could not be created.",
    )
    .await?;
    let response = state
        .api_request(
            Method::PATCH,
            &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/refs/heads/{PUBLISH_BRANCH}"),
            &bundle.access_token,
        )
        .json(&json!({ "sha": commit.sha, "force": false }))
        .send()
        .await
        .map_err(|_| "The publishing branch could not be updated.".to_string())?;
    if !response.status().is_success() {
        if response.status() == StatusCode::UNPROCESSABLE_ENTITY
            || response.status() == StatusCode::CONFLICT
        {
            clear_publish_plan(&state)?;
            return Err("The repository changed while you were publishing. Refresh the review and confirm again.".to_string());
        }
        return Err(api_status_message(
            response.status(),
            "The publishing branch could not be updated.",
        ));
    }
    clear_publish_plan(&state)?;
    Ok(PublishResult {
        commit_sha: commit.sha,
        branch: PUBLISH_BRANCH.to_string(),
        repository: REPOSITORY_FULL_NAME.to_string(),
        source_draft_id: plan.source_draft_id,
        recipe_slug: plan.recipe_slug,
        image_path: plan.image_path,
        published_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        deployment_status: "committed".to_string(),
    })
}

async fn connection_status_for_state(
    state: &GithubState,
) -> Result<GitHubConnectionStatus, String> {
    if let Some(status) = state.availability_status() {
        return Ok(status);
    }
    let bundle = match state.load_ready_token_bundle().await {
        Ok(Some(bundle)) => bundle,
        Ok(None) => return Ok(connection_status(true, true, false, None, None)),
        Err(message) => {
            return Ok(connection_status(true, true, false, None, Some(message)));
        }
    };
    match state.verify_repository(&bundle.access_token).await {
        Ok(repository) => Ok(connection_status(
            true,
            true,
            true,
            Some(iso_from_seconds(bundle.expires_at)),
            Some(format!("Ready to publish to {}.", repository.branch)),
        )),
        Err(message) => Ok(connection_status(
            true,
            true,
            false,
            Some(iso_from_seconds(bundle.expires_at)),
            Some(message),
        )),
    }
}

fn connection_status(
    available: bool,
    configured: bool,
    repository_verified: bool,
    token_expires_at: Option<String>,
    message: Option<String>,
) -> GitHubConnectionStatus {
    GitHubConnectionStatus {
        available,
        configured,
        connected: token_expires_at.is_some() || repository_verified,
        repository_verified,
        repository: REPOSITORY_FULL_NAME.to_string(),
        branch: PUBLISH_BRANCH.to_string(),
        token_expires_at,
        message,
    }
}

fn device_poll(
    state: &str,
    retry_after_seconds: Option<u64>,
    message: Option<&str>,
) -> DeviceFlowPoll {
    DeviceFlowPoll {
        state: state.to_string(),
        retry_after_seconds,
        message: message.map(ToOwned::to_owned),
        connection: None,
    }
}

fn clear_device_flow(state: &GithubState) -> Result<(), String> {
    *state
        .pending_device_flow
        .lock()
        .map_err(|_| "The device authorization state is unavailable.".to_string())? = None;
    Ok(())
}

fn update_poll_interval(
    state: &GithubState,
    current_interval: u64,
    returned_interval: Option<u64>,
    slowed: bool,
) -> Result<u64, String> {
    let mut flow = state
        .pending_device_flow
        .lock()
        .map_err(|_| "The device authorization state is unavailable.".to_string())?;
    let minimum = if slowed {
        current_interval + 5
    } else {
        current_interval
    };
    let next_interval = returned_interval.unwrap_or(minimum).max(minimum);
    if let Some(pending) = flow.as_mut() {
        pending.interval_seconds = next_interval;
        pending.next_poll_at = now_seconds() + pending.interval_seconds as i64;
    }
    Ok(next_interval)
}

fn clear_publish_plan(state: &GithubState) -> Result<(), String> {
    *state
        .pending_publish
        .lock()
        .map_err(|_| "The publication state is unavailable.".to_string())? = None;
    Ok(())
}

async fn parse_oauth_response(response: Response) -> Result<OAuthTokenResponse, String> {
    if !response.status().is_success() {
        return Err("GitHub rejected the authorization request.".to_string());
    }
    response
        .json::<OAuthTokenResponse>()
        .await
        .map_err(|_| "GitHub returned an invalid authorization response.".to_string())
}

fn token_bundle_from_response(
    response: &OAuthTokenResponse,
    now: i64,
) -> Result<TokenBundle, String> {
    let access_token = response
        .access_token
        .as_deref()
        .filter(|value| value.starts_with("ghu_") && value.len() >= 20)
        .ok_or_else(|| "GitHub did not return a valid user access token.".to_string())?;
    let refresh_token = response
        .refresh_token
        .as_deref()
        .filter(|value| value.starts_with("ghr_") && value.len() >= 20)
        .ok_or_else(|| {
            "Enable expiring user access tokens for the GitHub App, then connect again.".to_string()
        })?;
    let expires_in = response
        .expires_in
        .filter(|value| *value > TOKEN_REFRESH_MARGIN_SECONDS)
        .ok_or_else(|| "GitHub did not return access-token expiration metadata.".to_string())?;
    let refresh_expires_in = response
        .refresh_token_expires_in
        .filter(|value| *value > expires_in)
        .ok_or_else(|| "GitHub did not return refresh-token expiration metadata.".to_string())?;
    Ok(TokenBundle {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
        expires_at: now + expires_in,
        refresh_token_expires_at: now + refresh_expires_in,
    })
}

fn token_needs_refresh(bundle: &TokenBundle, now: i64) -> bool {
    bundle.expires_at <= now + TOKEN_REFRESH_MARGIN_SECONDS
}

fn oauth_error_message(error: &str, description: Option<&str>) -> String {
    match error {
        "bad_refresh_token" => "GitHub authorization expired. Connect GitHub again.".to_string(),
        "incorrect_client_credentials" => {
            "The configured GitHub App Client ID is invalid.".to_string()
        }
        "device_flow_disabled" => "Enable Device Flow in the GitHub App settings.".to_string(),
        _ => description
            .filter(|value| value.len() <= 240)
            .unwrap_or("GitHub authorization failed.")
            .to_string(),
    }
}

async fn read_api_json<T: DeserializeOwned>(
    response: Response,
    fallback: &str,
) -> Result<T, String> {
    if !response.status().is_success() {
        return Err(api_status_message(response.status(), fallback));
    }
    response.json::<T>().await.map_err(|_| fallback.to_string())
}

fn api_status_message(status: StatusCode, fallback: &str) -> String {
    match status {
        StatusCode::UNAUTHORIZED => {
            "GitHub authorization is no longer valid. Connect again.".to_string()
        }
        StatusCode::FORBIDDEN => {
            "The GitHub App does not have the required repository permissions.".to_string()
        }
        StatusCode::NOT_FOUND => {
            "The configured GitHub App cannot access the target repository.".to_string()
        }
        StatusCode::TOO_MANY_REQUESTS => {
            "GitHub rate-limited this request. Try again later.".to_string()
        }
        _ => fallback.to_string(),
    }
}

fn select_repository_installation(value: &InstallationsResponse) -> Result<u64, String> {
    value
        .installations
        .iter()
        .find(|installation| {
            installation.suspended_at.is_none()
                && installation.account.login.eq_ignore_ascii_case(REPOSITORY_OWNER)
                && installation.repository_selection == "selected"
                && installation.permissions.get("contents").map(String::as_str) == Some("write")
                && installation.permissions.get("metadata").map(String::as_str) == Some("read")
        })
        .map(|installation| installation.id)
        .ok_or_else(|| {
            "Install the GitHub App on DanielBrindusa with only ArtaGatitului selected and Contents read/write.".to_string()
        })
}

fn verify_repository_selection(value: &RepositoriesResponse) -> Result<(), String> {
    let target = value.repositories.iter().find(|repository| {
        repository.id == REPOSITORY_ID
            && repository
                .full_name
                .eq_ignore_ascii_case(REPOSITORY_FULL_NAME)
            && repository
                .permissions
                .as_ref()
                .is_some_and(|permissions| permissions.push)
    });
    if target.is_none() {
        return Err(
            "The GitHub App is not installed with write access to DanielBrindusa/ArtaGatitului."
                .to_string(),
        );
    }
    if value
        .repositories
        .iter()
        .any(|repository| repository.id != REPOSITORY_ID)
    {
        return Err(
            "Restrict this GitHub App authorization to ArtaGatitului only, then connect again."
                .to_string(),
        );
    }
    Ok(())
}

fn verify_repository_details(value: &RepositoryDetails) -> Result<(), String> {
    if value.id != REPOSITORY_ID || !value.full_name.eq_ignore_ascii_case(REPOSITORY_FULL_NAME) {
        return Err(
            "GitHub returned a repository identity that does not match ArtaGatitului.".to_string(),
        );
    }
    if value.default_branch != PUBLISH_BRANCH {
        return Err(format!(
            "The repository default branch is {}, but this build is pinned to {}.",
            value.default_branch, PUBLISH_BRANCH
        ));
    }
    if !value
        .permissions
        .as_ref()
        .is_some_and(|permissions| permissions.push)
    {
        return Err("The connected GitHub identity cannot write repository contents.".to_string());
    }
    Ok(())
}

fn build_publication_files(
    input: &PreparePublishInput,
) -> Result<(Vec<PublicationFile>, Option<String>), String> {
    if !valid_draft_id(&input.source_draft_id) {
        return Err("The source draft identifier is invalid.".to_string());
    }
    if !valid_slug(&input.slug) {
        return Err(
            "Use a safe slug with lowercase letters, numbers, and hyphens only.".to_string(),
        );
    }
    if input.title.trim().is_empty() || input.title.len() > 200 {
        return Err("Add a valid recipe title before publishing.".to_string());
    }
    if input.recipe_json.len() > MAX_RECIPE_JSON_BYTES {
        return Err("The recipe source is too large to publish.".to_string());
    }

    let (image_path, image_file) = match &input.image {
        Some(image) => {
            let bytes = BASE64
                .decode(&image.bytes_base64)
                .map_err(|_| "The local recipe image could not be decoded.".to_string())?;
            let extension = validate_image(&bytes, &image.mime_type)?;
            let path = format!("assets/images/recipes/{}.{}", input.slug, extension);
            if !allowed_publication_path(&path) {
                return Err("The generated recipe image path is not allowed.".to_string());
            }
            let file = PublicationFile {
                path: path.clone(),
                bytes,
                encoding: BlobEncoding::Base64,
            };
            (Some(path), Some(file))
        }
        None => (None, None),
    };

    let recipe = parse_and_validate_recipe_json(input, image_path.as_deref())?;
    let recipe_path = format!("src/content/recipes/{}.json", input.slug);
    if !allowed_publication_path(&recipe_path) {
        return Err("The generated recipe source path is not allowed.".to_string());
    }
    let mut recipe_bytes = serde_json::to_string_pretty(&recipe)
        .map_err(|_| "The recipe source could not be serialized.".to_string())?
        .into_bytes();
    recipe_bytes.push(b'\n');

    let mut files = vec![PublicationFile {
        path: recipe_path,
        bytes: recipe_bytes,
        encoding: BlobEncoding::Utf8,
    }];
    if let Some(file) = image_file {
        files.push(file);
    }
    Ok((files, image_path))
}

fn parse_and_validate_recipe_json(
    input: &PreparePublishInput,
    image_path: Option<&str>,
) -> Result<Value, String> {
    let mut value: Value = serde_json::from_str(&input.recipe_json)
        .map_err(|_| "The recipe source is not valid JSON.".to_string())?;
    if value_contains_unsafe_string(&value) {
        return Err("The recipe contains an unsafe URL or control value.".to_string());
    }
    let recipe = value
        .as_object_mut()
        .ok_or_else(|| "The recipe source must be a JSON object.".to_string())?;
    if recipe
        .keys()
        .any(|key| !RECIPE_SOURCE_KEYS.contains(&key.as_str()))
    {
        return Err("The recipe contains unsupported source fields.".to_string());
    }
    if string_field(recipe, "slug") != Some(input.slug.as_str())
        || string_field(recipe, "title") != Some(input.title.as_str())
    {
        return Err("The reviewed recipe identity does not match the active draft.".to_string());
    }
    if string_field(recipe, "category").is_none_or(|value| value.trim().is_empty()) {
        return Err("Choose a recipe category before publishing.".to_string());
    }
    validate_non_empty_string_array(recipe.get("ingredients"), "ingredients")?;
    let steps = validate_non_empty_string_array(recipe.get("steps"), "steps")?.clone();
    for field in ["beforeStart", "equipment", "keywords"] {
        validate_optional_string_array(recipe.get(field), field)?;
    }
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    recipe.insert("id".to_string(), Value::String(input.slug.clone()));
    recipe.insert("name".to_string(), Value::String(input.title.clone()));
    recipe.insert("status".to_string(), Value::String("published".to_string()));
    recipe.insert("preparation".to_string(), Value::Array(steps));
    recipe.insert(
        "image".to_string(),
        image_path.map_or(Value::Null, |path| Value::String(path.to_string())),
    );
    if recipe.get("createdAt").is_none_or(Value::is_null) {
        recipe.insert("createdAt".to_string(), Value::String(now.clone()));
    }
    recipe.insert("updatedAt".to_string(), Value::String(now));
    Ok(value)
}

fn string_field<'a>(map: &'a Map<String, Value>, field: &str) -> Option<&'a str> {
    map.get(field).and_then(Value::as_str)
}

fn validate_non_empty_string_array(
    value: Option<&Value>,
    field: &str,
) -> Result<Vec<Value>, String> {
    let items = value
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{field} must be a list."))?;
    if items.is_empty()
        || items
            .iter()
            .any(|item| item.as_str().is_none_or(|text| text.trim().is_empty()))
    {
        return Err(format!("{field} must contain non-empty text."));
    }
    Ok(items.clone())
}

fn validate_optional_string_array(value: Option<&Value>, field: &str) -> Result<(), String> {
    let Some(value) = value else {
        return Ok(());
    };
    let items = value
        .as_array()
        .ok_or_else(|| format!("{field} must be a list."))?;
    if items
        .iter()
        .any(|item| item.as_str().is_none_or(|text| text.trim().is_empty()))
    {
        return Err(format!("{field} must contain only non-empty text."));
    }
    Ok(())
}

fn value_contains_unsafe_string(value: &Value) -> bool {
    match value {
        Value::String(text) => {
            let normalized = text.trim().to_ascii_lowercase();
            text.contains('\0')
                || normalized.starts_with("data:")
                || normalized.starts_with("javascript:")
                || normalized.starts_with("file:")
        }
        Value::Array(items) => items.iter().any(value_contains_unsafe_string),
        Value::Object(map) => map.values().any(value_contains_unsafe_string),
        _ => false,
    }
}

fn validate_image(bytes: &[u8], declared_mime: &str) -> Result<&'static str, String> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err("Recipe images must be between 1 byte and 12 MB.".to_string());
    }
    let (mime, extension) = if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        ("image/jpeg", "jpg")
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        ("image/png", "png")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        ("image/webp", "webp")
    } else {
        return Err("Use a real JPEG, PNG, or WebP recipe image.".to_string());
    };
    if declared_mime != mime {
        return Err("The recipe image contents do not match its declared type.".to_string());
    }
    let size = imagesize::blob_size(bytes)
        .map_err(|_| "The recipe image dimensions could not be read.".to_string())?;
    if size.width < MIN_IMAGE_DIMENSION || size.height < MIN_IMAGE_DIMENSION {
        return Err("Recipe images must be at least 320 pixels in both dimensions.".to_string());
    }
    if size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION {
        return Err("Recipe images must not exceed 8000 pixels in either dimension.".to_string());
    }
    Ok(extension)
}

fn review_from_plan(plan: &PendingPublishPlan, branch: &str) -> PublishReview {
    let mut checks = vec![
        "Recipe valid".to_string(),
        "Slug available".to_string(),
        "GitHub connected".to_string(),
    ];
    if plan.image_path.is_some() {
        checks.push("Image valid and available locally".to_string());
    }
    PublishReview {
        plan_id: plan.id.clone(),
        recipe_title: plan.recipe_title.clone(),
        recipe_slug: plan.recipe_slug.clone(),
        repository: REPOSITORY_FULL_NAME.to_string(),
        branch: branch.to_string(),
        base_commit_sha: plan.base_commit_sha.clone(),
        files: plan.files.iter().map(|file| file.path.clone()).collect(),
        checks,
    }
}

fn allowed_publication_path(path: &str) -> bool {
    if path.starts_with('/')
        || path.contains('\\')
        || path.contains("..")
        || path.contains('%')
        || path
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == ".git")
    {
        return false;
    }
    if let Some(file) = path.strip_prefix("src/content/recipes/") {
        return file
            .strip_suffix(".json")
            .is_some_and(|slug| valid_slug(slug) && !slug.contains('.'));
    }
    if let Some(file) = path.strip_prefix("assets/images/recipes/") {
        return [".jpg", ".png", ".webp"].iter().any(|extension| {
            file.strip_suffix(extension)
                .is_some_and(|slug| valid_slug(slug) && !slug.contains('.'))
        });
    }
    false
}

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && !value.starts_with('-')
        && !value.ends_with('-')
        && !value.contains("--")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn valid_draft_id(value: &str) -> bool {
    value.starts_with("draft-")
        && value.len() <= 80
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn valid_client_id(value: &str) -> bool {
    (8..=80).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn iso_from_seconds(seconds: i64) -> String {
    chrono::DateTime::<Utc>::from_timestamp(seconds, 0)
        .unwrap_or_else(Utc::now)
        .to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::storage::MemorySecretStore;

    fn recipe_input(image: Option<PublishImageInput>) -> PreparePublishInput {
        PreparePublishInput {
            source_draft_id: "draft-test-123".to_string(),
            slug: "paste-carbonara".to_string(),
            title: "Paste Carbonara".to_string(),
            recipe_json: serde_json::to_string(&json!({
                "id": "draft-test-123",
                "slug": "paste-carbonara",
                "title": "Paste Carbonara",
                "name": "Paste Carbonara",
                "description": "Reteta de test",
                "category": "Fel principal",
                "ingredients": ["Paste", "Ou"],
                "steps": ["Fierbe pastele"],
                "preparation": ["Fierbe pastele"],
                "beforeStart": [],
                "tags": {},
                "equipment": [],
                "prepTimeMinutes": 10,
                "cookTimeMinutes": 15,
                "totalTimeMinutes": 25,
                "servings": 2,
                "image": null,
                "sourceUrl": null,
                "createdAt": null,
                "updatedAt": null,
                "status": "draft",
                "closing": "Pofta buna!",
                "extras": [],
                "ratingSummary": null,
                "keywords": ["paste", "carbonara"]
            }))
            .unwrap(),
            image,
        }
    }

    fn installations_fixture() -> InstallationsResponse {
        serde_json::from_str(include_str!("test-fixtures/installations.json")).unwrap()
    }

    fn repositories_fixture() -> RepositoriesResponse {
        serde_json::from_str(include_str!("test-fixtures/repositories.json")).unwrap()
    }

    #[test]
    fn token_refresh_margin_is_enforced() {
        let bundle = TokenBundle {
            access_token: "ghu_test_access_token_123456".to_string(),
            refresh_token: "ghr_test_refresh_token_123456".to_string(),
            expires_at: 1_000,
            refresh_token_expires_at: 10_000,
        };
        assert!(!token_needs_refresh(&bundle, 699));
        assert!(token_needs_refresh(&bundle, 700));
    }

    #[test]
    fn device_tokens_require_rotating_refresh_credentials() {
        let response = OAuthTokenResponse {
            access_token: Some("ghu_test_access_token_123456".to_string()),
            refresh_token: None,
            expires_in: Some(28_800),
            refresh_token_expires_in: None,
            error: None,
            error_description: None,
            interval: None,
        };
        assert!(token_bundle_from_response(&response, 100).is_err());
    }

    #[test]
    fn device_flow_respects_interval_and_slow_down_backoff() {
        let state = GithubState::for_test(Arc::new(MemorySecretStore::empty()));
        *state.pending_device_flow.lock().unwrap() = Some(PendingDeviceFlow {
            device_code: "device-code".to_string(),
            user_code: "ABCD-EFGH".to_string(),
            verification_uri: DEVICE_PAGE_URL.to_string(),
            expires_at: now_seconds() + 900,
            interval_seconds: 5,
            next_poll_at: 0,
        });

        assert_eq!(update_poll_interval(&state, 5, Some(3), false).unwrap(), 5);
        assert_eq!(update_poll_interval(&state, 5, None, true).unwrap(), 10);
        let pending = state.pending_device_flow.lock().unwrap().clone().unwrap();
        assert_eq!(pending.interval_seconds, 10);
        assert!(pending.next_poll_at >= now_seconds() + 9);
    }

    #[test]
    fn secure_storage_abstraction_round_trips_without_exposing_tokens() {
        let store = Arc::new(MemorySecretStore::empty());
        let state = GithubState::for_test(store.clone());
        let bundle = TokenBundle {
            access_token: "ghu_test_access_token_123456".to_string(),
            refresh_token: "ghr_test_refresh_token_123456".to_string(),
            expires_at: 1_000,
            refresh_token_expires_at: 10_000,
        };
        state.save_token_bundle(&bundle).unwrap();
        let loaded = state.load_token_bundle().unwrap().unwrap();
        assert_eq!(loaded.expires_at, 1_000);
        state.delete_token_bundle().unwrap();
        assert!(state.load_token_bundle().unwrap().is_none());
    }

    #[test]
    fn repository_fixtures_require_selected_contents_write_access() {
        assert_eq!(
            select_repository_installation(&installations_fixture()).unwrap(),
            42
        );
        verify_repository_selection(&repositories_fixture()).unwrap();
    }

    #[test]
    fn publication_paths_reject_traversal_and_privileged_files() {
        assert!(allowed_publication_path(
            "src/content/recipes/paste-carbonara.json"
        ));
        assert!(allowed_publication_path(
            "assets/images/recipes/paste-carbonara.webp"
        ));
        assert!(!allowed_publication_path(
            "src/content/recipes/../package.json"
        ));
        assert!(!allowed_publication_path(".github/workflows/deploy.yml"));
        assert!(!allowed_publication_path("src/content/recipes/%2e%2e.json"));
    }

    #[test]
    fn recipe_plan_builds_source_and_image_without_generated_output() {
        let (files, image_path) = build_publication_files(&recipe_input(None)).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/content/recipes/paste-carbonara.json");
        assert!(image_path.is_none());
        let source: Value = serde_json::from_slice(&files[0].bytes).unwrap();
        assert_eq!(source["id"], "paste-carbonara");
        assert_eq!(source["status"], "published");
        assert!(source["image"].is_null());

        let image = PublishImageInput {
            bytes_base64: BASE64.encode(include_bytes!("../../../icon.png")),
            mime_type: "image/png".to_string(),
        };
        let (files, image_path) = build_publication_files(&recipe_input(Some(image))).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "src/content/recipes/paste-carbonara.json");
        assert_eq!(files[1].path, "assets/images/recipes/paste-carbonara.png");
        assert_eq!(image_path.as_deref(), Some(files[1].path.as_str()));
        let source: Value = serde_json::from_slice(&files[0].bytes).unwrap();
        assert_eq!(source["image"], files[1].path);
    }

    #[test]
    fn branch_conflict_requires_a_new_review() {
        let plan = PendingPublishPlan {
            id: "plan".to_string(),
            source_draft_id: "draft-test-123".to_string(),
            recipe_title: "Paste Carbonara".to_string(),
            recipe_slug: "paste-carbonara".to_string(),
            base_commit_sha: "a".repeat(40),
            base_tree_sha: "b".repeat(40),
            files: vec![],
            image_path: None,
            created_at: now_seconds(),
        };
        assert_ne!(plan.base_commit_sha, "c".repeat(40));
        let update_body = json!({ "sha": "d".repeat(40), "force": false });
        assert_eq!(update_body["force"], false);
    }

    #[test]
    fn publishing_guard_blocks_duplicate_activation() {
        let active = AtomicBool::new(false);
        assert!(active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok());
        assert!(active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "writes and deletes a temporary Windows Credential Manager entry"]
    fn windows_native_secure_store_round_trip() {
        initialize_secure_storage().unwrap();
        let account = format!("github-storage-test-{}", Uuid::new_v4());
        let entry =
            keyring_core::Entry::new("ro.danielbrindusa.artagatitului.test", &account).unwrap();
        entry.set_password("temporary-test-secret").unwrap();
        assert_eq!(entry.get_password().unwrap(), "temporary-test-secret");
        entry.delete_credential().unwrap();
    }
}
