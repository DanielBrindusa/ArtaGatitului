mod storage;

use std::{
    collections::{BTreeMap, HashMap, HashSet},
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
const HISTORY_LIMIT: usize = 60;

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
    "imageAlt",
    "sourceUrl",
    "createdAt",
    "updatedAt",
    "status",
    "closing",
    "extras",
    "ratingSummary",
    "keywords",
    "template",
    "layout",
];
const PAGE_SOURCE_KEYS: &[&str] = &[
    "id",
    "pageType",
    "title",
    "slug",
    "description",
    "socialImage",
    "status",
    "template",
    "layout",
];
const PAGE_BLOCK_KEYS: &[&str] = &["id", "type", "data", "layout", "responsive", "variant", "style"];
const PAGE_BLOCK_TYPES: &[&str] = &[
    "section",
    "container",
    "columns",
    "column",
    "grid",
    "hero",
    "heading",
    "text",
    "rich-text",
    "image",
    "divider",
    "spacer",
    "button",
    "search",
    "recipe-grid",
    "featured-recipes",
    "latest-recipes",
    "category-grid",
    "random-recipe",
    "global-reference",
];
const SITE_SOURCE_PATHS: &[&str] = &[
    "src/content/site/templates.json",
    "src/content/site/global-blocks.json",
    "src/content/site/navigation.json",
    "src/content/site/settings.json",
    "src/content/site/theme.json",
    "src/content/categories.json",
    "src/data/tag-groups.json",
];
const SITE_PUBLISH_AREAS: &[&str] = &[
    "templates", "global-blocks", "navigation", "taxonomies", "theme", "settings", "site",
];
const RESERVED_PAGE_ROUTES: &[&str] = &[
    "assets",
    "categorie",
    "retete",
    "randomizer",
    "portofoliu",
    "soon-to-come",
    "categorii",
    "cauta",
    "ce-pot-gati",
    "adauga-reteta",
    "offline",
    "index",
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
    image_action: ImageAction,
    source: Option<PublishedSourceIdentity>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishPageImageInput {
    block_id: String,
    bytes_base64: String,
    mime_type: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparePagePublishInput {
    source_draft_id: String,
    slug: String,
    title: String,
    page_json: String,
    images: Vec<PublishPageImageInput>,
    source: Option<PublishedSourceIdentity>,
    occupied_routes: Vec<String>,
}

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum ImageAction {
    Retain,
    Replace,
    Remove,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedSourceIdentity {
    path: String,
    slug: String,
    commit_sha: String,
    blob_sha: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedRecipeSummary {
    path: String,
    slug: String,
    title: String,
    category: String,
    image_path: Option<String>,
    commit_sha: String,
    blob_sha: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedRecipe {
    path: String,
    slug: String,
    title: String,
    category: String,
    image_path: Option<String>,
    commit_sha: String,
    blob_sha: String,
    source_json: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedPageSummary {
    path: String,
    slug: String,
    id: String,
    title: String,
    page_type: String,
    commit_sha: String,
    blob_sha: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedPage {
    path: String,
    slug: String,
    id: String,
    title: String,
    page_type: String,
    commit_sha: String,
    blob_sha: String,
    source_json: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteSourceSnapshot {
    path: String,
    blob_sha: String,
    source_json: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteConfigurationSnapshot {
    commit_sha: String,
    sources: Vec<SiteSourceSnapshot>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareSiteFileInput {
    path: String,
    blob_sha: String,
    source_json: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareSitePublishInput {
    source_draft_id: String,
    area: String,
    files: Vec<PrepareSiteFileInput>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicationFileChange {
    operation: ChangeOperation,
    path: String,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum ChangeOperation {
    Add,
    Modify,
    Delete,
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
    operation: String,
    file_changes: Vec<PublicationFileChange>,
    checks: Vec<String>,
    route_changes: Vec<String>,
    dependency_impact: Vec<String>,
    global_impact_count: usize,
    image_status: String,
    conflict_status: String,
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
    operation: String,
    recipe_path: Option<String>,
    recipe_blob_sha: Option<String>,
    recipe_json: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmsHistoryEntry {
    commit_sha: String,
    parent_sha: Option<String>,
    message: String,
    authored_at: String,
    author: String,
    action: String,
    content_type: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmsHistoryFile {
    path: String,
    previous_path: Option<String>,
    operation: String,
    additions: usize,
    deletions: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmsHistoryDetails {
    entry: CmsHistoryEntry,
    files: Vec<CmsHistoryFile>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoricalContent {
    commit_sha: String,
    path: String,
    blob_sha: String,
    content_type: String,
    source_json: String,
    current_source_json: Option<String>,
    current_blob_sha: Option<String>,
    asset_status: Vec<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareRestoreInput {
    commit_sha: String,
    path: String,
    source_draft_id: String,
    source_json: String,
    confirmation: String,
}

#[derive(Clone, Deserialize)]
struct ApiCommitAuthor {
    name: String,
    date: String,
}

#[derive(Clone, Deserialize)]
struct ApiCommitData {
    message: String,
    author: Option<ApiCommitAuthor>,
}

#[derive(Clone, Deserialize)]
struct ApiCommitParent {
    sha: String,
}

#[derive(Clone, Deserialize)]
struct ApiCommitSummary {
    sha: String,
    commit: ApiCommitData,
    parents: Vec<ApiCommitParent>,
}

#[derive(Clone, Deserialize)]
struct ApiCommitFile {
    filename: String,
    previous_filename: Option<String>,
    status: String,
    additions: usize,
    deletions: usize,
}

#[derive(Clone, Deserialize)]
struct ApiCommitDetails {
    sha: String,
    commit: ApiCommitData,
    parents: Vec<ApiCommitParent>,
    files: Vec<ApiCommitFile>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeDependency {
    path: String,
    reason: String,
    auto_removable: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAnalysis {
    path: String,
    slug: String,
    title: String,
    image_path: Option<String>,
    image_unique: bool,
    commit_sha: String,
    blob_sha: String,
    dependencies: Vec<RecipeDependency>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareDeleteInput {
    source_draft_id: String,
    path: String,
    slug: String,
    commit_sha: String,
    blob_sha: String,
    title: String,
    confirmation: String,
    delete_unique_image: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDeleteAnalysis {
    path: String,
    slug: String,
    id: String,
    title: String,
    page_type: String,
    commit_sha: String,
    blob_sha: String,
    dependencies: Vec<RecipeDependency>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparePageDeleteInput {
    source_draft_id: String,
    path: String,
    slug: String,
    commit_sha: String,
    blob_sha: String,
    title: String,
    confirmation: String,
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

#[derive(Clone)]
struct PublicationChange {
    operation: ChangeOperation,
    path: String,
    file: Option<PublicationFile>,
}

#[derive(Clone)]
struct PathExpectation {
    path: String,
    sha: Option<String>,
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
    operation: String,
    changes: Vec<PublicationChange>,
    expectations: Vec<PathExpectation>,
    image_path: Option<String>,
    recipe_path: Option<String>,
    recipe_json: Option<String>,
    commit_message: String,
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

#[derive(Deserialize)]
struct RecursiveTree {
    truncated: bool,
    tree: Vec<GitTreeEntry>,
}

#[derive(Clone, Deserialize)]
struct GitTreeEntry {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    kind: String,
    sha: String,
}

#[derive(Deserialize)]
struct GitBlob {
    content: String,
    encoding: String,
    size: usize,
}

struct RepositorySnapshot {
    commit_sha: String,
    tree_sha: String,
    entries: HashMap<String, GitTreeEntry>,
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
        let client_id = Some(option_env!("ARTA_GITHUB_APP_CLIENT_ID").unwrap_or("Iv23liRLWgslBaQqo9XQ"))
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

    async fn repository_snapshot(&self, token: &str) -> Result<RepositorySnapshot, String> {
        let commit_sha = self.current_ref(token).await?;
        self.repository_snapshot_at(token, &commit_sha).await
    }

    async fn repository_snapshot_at(
        &self,
        token: &str,
        commit_sha: &str,
    ) -> Result<RepositorySnapshot, String> {
        if !valid_sha(commit_sha) {
            return Err("The historical commit identity is invalid.".to_string());
        }
        let tree_sha = self.commit_tree(token, &commit_sha).await?;
        let tree: RecursiveTree = read_api_json(
            self.api_request(
                Method::GET,
                &format!(
                    "/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/trees/{tree_sha}?recursive=1"
                ),
                token,
            )
            .send()
            .await
            .map_err(|_| "The repository source tree could not be fetched.".to_string())?,
            "The repository source tree could not be read.",
        )
        .await?;
        if tree.truncated {
            return Err("The repository source tree is too large to inspect safely.".to_string());
        }
        let entries = tree
            .tree
            .into_iter()
            .map(|entry| (entry.path.clone(), entry))
            .collect();
        Ok(RepositorySnapshot {
            commit_sha: commit_sha.to_string(),
            tree_sha,
            entries,
        })
    }

    async fn read_blob(&self, token: &str, sha: &str, limit: usize) -> Result<Vec<u8>, String> {
        if !valid_sha(sha) {
            return Err("The repository blob identity is invalid.".to_string());
        }
        let blob: GitBlob = read_api_json(
            self.api_request(
                Method::GET,
                &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/git/blobs/{sha}"),
                token,
            )
            .send()
            .await
            .map_err(|_| "Repository content could not be fetched.".to_string())?,
            "Repository content could not be read.",
        )
        .await?;
        if blob.encoding != "base64" || blob.size > limit {
            return Err("Repository content has an unsupported encoding or size.".to_string());
        }
        let compact: String = blob
            .content
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect();
        let bytes = BASE64
            .decode(compact)
            .map_err(|_| "Repository content could not be decoded.".to_string())?;
        if bytes.len() > limit {
            return Err("Repository content exceeds the allowed size.".to_string());
        }
        Ok(bytes)
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

fn history_content_type(message: &str) -> String {
    for content_type in ["recipe", "page", "homepage", "template", "navigation", "theme"] {
        if message.to_lowercase().contains(content_type) {
            return content_type.to_string();
        }
    }
    "site".to_string()
}

fn history_action(message: &str) -> String {
    let lower = message.to_lowercase();
    for action in ["restore", "delete", "rename", "create", "update", "publish"] {
        if lower.contains(action) {
            return action.to_string();
        }
    }
    "change".to_string()
}

fn history_entry_from_api(value: &ApiCommitSummary) -> CmsHistoryEntry {
    CmsHistoryEntry {
        commit_sha: value.sha.clone(),
        parent_sha: value.parents.first().map(|parent| parent.sha.clone()),
        message: value.commit.message.lines().next().unwrap_or("CMS change").to_string(),
        authored_at: value.commit.author.as_ref().map(|author| author.date.clone()).unwrap_or_default(),
        author: value.commit.author.as_ref().map(|author| author.name.clone()).unwrap_or_else(|| "CMS editor".to_string()),
        action: history_action(&value.commit.message),
        content_type: history_content_type(&value.commit.message),
    }
}

fn restorable_source_path(path: &str) -> bool {
    recipe_slug_from_path(path).is_some()
        || page_slug_from_path(path).is_some()
        || SITE_SOURCE_PATHS.contains(&path)
}

fn normalize_historical_source(path: &str, mut value: Value) -> Result<Value, String> {
    if let Some(slug) = recipe_slug_from_path(path) {
        let recipe = value.as_object_mut().ok_or_else(|| "The historical recipe is not a JSON object.".to_string())?;
        if !recipe.contains_key("steps") {
            if let Some(preparation) = recipe.get("preparation").cloned() {
                recipe.insert("steps".to_string(), preparation);
            }
        }
        if !recipe.contains_key("preparation") {
            if let Some(steps) = recipe.get("steps").cloned() {
                recipe.insert("preparation".to_string(), steps);
            }
        }
        if !recipe.contains_key("layout") {
            recipe.insert("layout".to_string(), json!({ "modelVersion": 1, "blocks": [] }));
        }
        if !recipe.contains_key("title") {
            if let Some(name) = recipe.get("name").cloned() {
                recipe.insert("title".to_string(), name);
            }
        }
        if !recipe.contains_key("name") {
            if let Some(title) = recipe.get("title").cloned() {
                recipe.insert("name".to_string(), title);
            }
        }
        recipe.insert("status".to_string(), Value::String("published".to_string()));
        validate_repository_recipe(&value, slug)?;
        return Ok(value);
    }
    if let Some(slug) = page_slug_from_path(path) {
        if let Some(page) = value.as_object_mut() {
            page.insert("status".to_string(), Value::String("published".to_string()));
        }
        validate_repository_page(&value, slug).map_err(|error| format!("This historical page cannot be migrated safely: {error}"))?;
        return Ok(value);
    }
    if SITE_SOURCE_PATHS.contains(&path) {
        validate_site_source_value(path, &value)?;
        return Ok(value);
    }
    Err("Only recipe, page, and approved site configuration sources can be restored.".to_string())
}

fn collect_historical_assets(value: &Value, assets: &mut HashSet<String>) {
    match value {
        Value::String(path) if allowed_recipe_image_path(path) || allowed_page_image_path(path) => {
            assets.insert(path.clone());
        }
        Value::Array(items) => items.iter().for_each(|item| collect_historical_assets(item, assets)),
        Value::Object(map) => map.values().for_each(|item| collect_historical_assets(item, assets)),
        _ => {}
    }
}

fn image_mime_for_path(path: &str) -> Option<&'static str> {
    if path.ends_with(".png") { Some("image/png") }
    else if path.ends_with(".jpg") || path.ends_with(".jpeg") { Some("image/jpeg") }
    else if path.ends_with(".webp") { Some("image/webp") }
    else { None }
}

fn validate_restore_identity(historical: &Value, current: &Value) -> Result<(), String> {
    let old_id = historical.get("id").and_then(Value::as_str);
    let current_id = current.get("id").and_then(Value::as_str);
    if old_id.is_some() && current_id.is_some() && old_id != current_id {
        return Err("This slug now belongs to a different content item. Choose a new slug and publish manually.".to_string());
    }
    Ok(())
}

fn historical_asset_statuses(
    value: &Value,
    current: &RepositorySnapshot,
    historical: &RepositorySnapshot,
) -> Result<Vec<String>, String> {
    let mut assets = HashSet::new();
    collect_historical_assets(value, &mut assets);
    let mut statuses = Vec::new();
    for asset in assets {
        let status = if current.entries.contains_key(&asset) {
            "available"
        } else if historical.entries.contains_key(&asset) {
            "will be restored"
        } else {
            return Err("A referenced historical image is missing from both the current tree and repository history.".to_string());
        };
        statuses.push(format!("{asset}: {status}"));
    }
    statuses.sort();
    Ok(statuses)
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

async fn require_cms_history_commit(
    state: &GithubState,
    access_token: &str,
    commit_sha: &str,
) -> Result<(), String> {
    let details: ApiCommitDetails = read_api_json(
        state
            .api_request(
                Method::GET,
                &format!(
                    "/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/commits/{commit_sha}"
                ),
                access_token,
            )
            .send()
            .await
            .map_err(|_| "The selected history entry could not be fetched.".to_string())?,
        "The selected history entry could not be read.",
    )
    .await?;
    if !details.commit.message.starts_with("cms:") {
        return Err("Only CMS-originated publication commits can be restored.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn github_list_cms_history(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<Vec<CmsHistoryEntry>, String> {
    require_local_shell(&caller)?;
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let commits: Vec<ApiCommitSummary> = read_api_json(
        state.api_request(
            Method::GET,
            &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/commits?sha={PUBLISH_BRANCH}&per_page={HISTORY_LIMIT}"),
            &bundle.access_token,
        ).send().await.map_err(|_| "GitHub publication history could not be fetched.".to_string())?,
        "GitHub publication history could not be read.",
    ).await?;
    Ok(commits.iter()
        .filter(|commit| commit.commit.message.starts_with("cms:"))
        .map(history_entry_from_api)
        .collect())
}

#[tauri::command]
pub async fn github_get_cms_history_details(
    caller: Webview,
    state: State<'_, GithubState>,
    commit_sha: String,
) -> Result<CmsHistoryDetails, String> {
    require_local_shell(&caller)?;
    if !valid_sha(&commit_sha) { return Err("The history commit identity is invalid.".to_string()); }
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let details: ApiCommitDetails = read_api_json(
        state.api_request(
            Method::GET,
            &format!("/repos/{REPOSITORY_OWNER}/{REPOSITORY_NAME}/commits/{commit_sha}"),
            &bundle.access_token,
        ).send().await.map_err(|_| "The selected history entry could not be fetched.".to_string())?,
        "The selected history entry could not be read.",
    ).await?;
    if !details.commit.message.starts_with("cms:") {
        return Err("Only CMS-originated publication commits are shown here.".to_string());
    }
    let summary = ApiCommitSummary {
        sha: details.sha.clone(),
        commit: details.commit.clone(),
        parents: details.parents.clone(),
    };
    let files = details.files.into_iter()
        .filter(|file| allowed_publication_path(&file.filename))
        .map(|file| CmsHistoryFile {
            path: file.filename,
            previous_path: file.previous_filename,
            operation: file.status,
            additions: file.additions,
            deletions: file.deletions,
        }).collect();
    Ok(CmsHistoryDetails { entry: history_entry_from_api(&summary), files })
}

#[tauri::command]
pub async fn github_load_history_content(
    caller: Webview,
    state: State<'_, GithubState>,
    commit_sha: String,
    path: String,
) -> Result<HistoricalContent, String> {
    require_local_shell(&caller)?;
    if !valid_sha(&commit_sha) || !restorable_source_path(&path) {
        return Err("The requested historical content is outside the approved CMS sources.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    require_cms_history_commit(&state, &bundle.access_token, &commit_sha).await?;
    let historical = state.repository_snapshot_at(&bundle.access_token, &commit_sha).await?;
    let entry = snapshot_blob(&historical, &path)
        .ok_or_else(|| "This content did not exist at the selected commit.".to_string())?;
    let value = normalize_historical_source(&path, repository_json_value(&state, &bundle.access_token, entry).await?)?;
    let mut source_json = serde_json::to_string_pretty(&value).map_err(|_| "Historical content could not be normalized.".to_string())?;
    source_json.push('\n');
    let current = state.repository_snapshot(&bundle.access_token).await?;
    let (current_source_json, current_blob_sha) = if let Some(current_entry) = snapshot_blob(&current, &path) {
        let current_value = repository_json_value(&state, &bundle.access_token, current_entry).await?;
        (Some(format!("{}\n", serde_json::to_string_pretty(&current_value).map_err(|_| "Current content could not be normalized.".to_string())?)), Some(current_entry.sha.clone()))
    } else { (None, None) };
    let asset_status = historical_asset_statuses(&value, &current, &historical)?;
    Ok(HistoricalContent {
        commit_sha,
        path: path.clone(),
        blob_sha: entry.sha.clone(),
        content_type: if recipe_slug_from_path(&path).is_some() { "recipe" } else if page_slug_from_path(&path).is_some() { "page" } else { "site" }.to_string(),
        source_json,
        current_source_json,
        current_blob_sha,
        asset_status,
    })
}

#[tauri::command]
pub async fn github_prepare_content_restore(
    caller: Webview,
    state: State<'_, GithubState>,
    input: PrepareRestoreInput,
) -> Result<PublishReview, String> {
    require_local_shell(&caller)?;
    if state.publishing.load(Ordering::Acquire) { return Err("A publication is already in progress.".to_string()); }
    if !valid_sha(&input.commit_sha) || !restorable_source_path(&input.path) || !valid_draft_id(&input.source_draft_id) {
        return Err("The restoration request is invalid.".to_string());
    }
    if input.confirmation != "RESTORE" {
        return Err("Type RESTORE to confirm this historical restoration.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    let repository = state.verify_repository(&bundle.access_token).await?;
    require_cms_history_commit(&state, &bundle.access_token, &input.commit_sha).await?;
    let historical = state.repository_snapshot_at(&bundle.access_token, &input.commit_sha).await?;
    let historical_entry = snapshot_blob(&historical, &input.path)
        .ok_or_else(|| "This content did not exist at the selected commit.".to_string())?;
    let historical_value = normalize_historical_source(
        &input.path,
        repository_json_value(&state, &bundle.access_token, historical_entry).await?,
    )?;
    let supplied_value: Value = serde_json::from_str(&input.source_json)
        .map_err(|_| "The restoration draft is not valid JSON.".to_string())?;
    let restored = normalize_historical_source(&input.path, supplied_value)?;
    if restored != historical_value {
        return Err("The restoration draft no longer matches the reviewed historical source.".to_string());
    }
    let latest = state.repository_snapshot(&bundle.access_token).await?;
    let current_entry = snapshot_blob(&latest, &input.path);
    if let Some(current) = current_entry {
        let current_value = repository_json_value(&state, &bundle.access_token, current).await?;
        validate_restore_identity(&historical_value, &current_value)?;
    }
    let mut normalized_json = serde_json::to_string_pretty(&restored)
        .map_err(|_| "The restored source could not be serialized.".to_string())?;
    normalized_json.push('\n');
    let mut changes = vec![PublicationChange {
        operation: if current_entry.is_some() { ChangeOperation::Modify } else { ChangeOperation::Add },
        path: input.path.clone(),
        file: Some(PublicationFile { path: input.path.clone(), bytes: normalized_json.as_bytes().to_vec(), encoding: BlobEncoding::Utf8 }),
    }];
    let mut expectations = vec![PathExpectation { path: input.path.clone(), sha: current_entry.map(|entry| entry.sha.clone()) }];
    let mut assets = HashSet::new();
    collect_historical_assets(&restored, &mut assets);
    for asset in assets {
        if latest.entries.contains_key(&asset) { continue; }
        let historical_asset = snapshot_blob(&historical, &asset)
            .ok_or_else(|| format!("Historical asset {asset} is unavailable."))?;
        let mime = image_mime_for_path(&asset).ok_or_else(|| format!("Historical asset {asset} has an unsupported format."))?;
        let bytes = state.read_blob(&bundle.access_token, &historical_asset.sha, MAX_IMAGE_BYTES).await?;
        validate_image(&bytes, mime)?;
        changes.push(PublicationChange {
            operation: ChangeOperation::Add,
            path: asset.clone(),
            file: Some(PublicationFile { path: asset.clone(), bytes, encoding: BlobEncoding::Base64 }),
        });
        expectations.push(PathExpectation { path: asset, sha: None });
    }
    let slug = recipe_slug_from_path(&input.path).or_else(|| page_slug_from_path(&input.path)).unwrap_or("site-management");
    let title = restored.get("title").and_then(Value::as_str).unwrap_or(slug);
    let plan = PendingPublishPlan {
        id: Uuid::new_v4().to_string(),
        source_draft_id: input.source_draft_id,
        recipe_title: title.to_string(),
        recipe_slug: slug.to_string(),
        base_commit_sha: latest.commit_sha.clone(),
        operation: "restore".to_string(),
        changes,
        expectations,
        image_path: restored.get("image").and_then(Value::as_str).map(ToOwned::to_owned),
        recipe_path: Some(input.path.clone()),
        recipe_json: Some(normalized_json),
        commit_message: format!("cms: restore {} {} from {}", if recipe_slug_from_path(&input.path).is_some() { "recipe" } else if page_slug_from_path(&input.path).is_some() { "page" } else { "site" }, slug, &input.commit_sha[..12]),
        created_at: now_seconds(),
    };
    let review = review_from_plan(&plan, &repository.branch);
    *state.pending_publish.lock().map_err(|_| "The restoration review could not be stored.".to_string())? = Some(plan);
    Ok(review)
}

#[tauri::command]
pub async fn github_list_published_recipes(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<Vec<PublishedRecipeSummary>, String> {
    require_local_shell(&caller)?;
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let mut recipes = Vec::new();
    let mut entries: Vec<_> = snapshot
        .entries
        .values()
        .filter(|entry| recipe_slug_from_path(&entry.path).is_some())
        .cloned()
        .collect();
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    for entry in entries {
        let published =
            published_recipe_from_entry(&state, &bundle.access_token, &snapshot, &entry).await?;
        recipes.push(PublishedRecipeSummary {
            path: published.path,
            slug: published.slug,
            title: published.title,
            category: published.category,
            image_path: published.image_path,
            commit_sha: published.commit_sha,
            blob_sha: published.blob_sha,
        });
    }
    recipes.sort_by(|left, right| left.title.to_lowercase().cmp(&right.title.to_lowercase()));
    Ok(recipes)
}

#[tauri::command]
pub async fn github_load_published_recipe(
    caller: Webview,
    state: State<'_, GithubState>,
    slug: String,
) -> Result<PublishedRecipe, String> {
    require_local_shell(&caller)?;
    if !valid_slug(&slug) {
        return Err("The published recipe slug is invalid.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let path = recipe_path(&slug);
    let entry = snapshot
        .entries
        .get(&path)
        .ok_or_else(|| "The published recipe no longer exists.".to_string())?;
    published_recipe_from_entry(&state, &bundle.access_token, &snapshot, entry).await
}

#[tauri::command]
pub async fn github_list_published_pages(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<Vec<PublishedPageSummary>, String> {
    require_local_shell(&caller)?;
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let mut entries: Vec<_> = snapshot
        .entries
        .values()
        .filter(|entry| page_slug_from_path(&entry.path).is_some())
        .cloned()
        .collect();
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    let mut pages = Vec::new();
    for entry in entries {
        let page = published_page_from_entry(&state, &bundle.access_token, &snapshot, &entry).await?;
        pages.push(PublishedPageSummary {
            path: page.path,
            slug: page.slug,
            id: page.id,
            title: page.title,
            page_type: page.page_type,
            commit_sha: page.commit_sha,
            blob_sha: page.blob_sha,
        });
    }
    pages.sort_by(|left, right| {
        (left.page_type != "home", left.title.to_lowercase())
            .cmp(&(right.page_type != "home", right.title.to_lowercase()))
    });
    Ok(pages)
}

#[tauri::command]
pub async fn github_load_published_page(
    caller: Webview,
    state: State<'_, GithubState>,
    slug: String,
) -> Result<PublishedPage, String> {
    require_local_shell(&caller)?;
    if !valid_slug(&slug) {
        return Err("The published page slug is invalid.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let path = page_path(&slug);
    let entry = snapshot
        .entries
        .get(&path)
        .ok_or_else(|| "The published page no longer exists.".to_string())?;
    published_page_from_entry(&state, &bundle.access_token, &snapshot, entry).await
}

#[tauri::command]
pub async fn github_load_site_configuration(
    caller: Webview,
    state: State<'_, GithubState>,
) -> Result<SiteConfigurationSnapshot, String> {
    require_local_shell(&caller)?;
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let mut paths: Vec<String> = SITE_SOURCE_PATHS.iter().map(|path| (*path).to_string()).collect();
    paths.extend(snapshot.entries.keys().filter(|path| {
        recipe_slug_from_path(path).is_some() || page_slug_from_path(path).is_some()
    }).cloned());
    paths.sort();
    paths.dedup();
    let mut sources = Vec::with_capacity(paths.len());
    for path in paths {
        let entry = snapshot_blob(&snapshot, &path)
            .ok_or_else(|| format!("Required site source {path} does not exist on {PUBLISH_BRANCH}."))?;
        let value = repository_json_value(&state, &bundle.access_token, entry).await?;
        validate_site_source_value(&path, &value)?;
        let mut source_json = serde_json::to_string_pretty(&value)
            .map_err(|_| format!("{path} could not be serialized."))?;
        source_json.push('\n');
        sources.push(SiteSourceSnapshot { path, blob_sha: entry.sha.clone(), source_json });
    }
    Ok(SiteConfigurationSnapshot { commit_sha: snapshot.commit_sha, sources })
}

#[tauri::command]
pub async fn github_prepare_site_publish(
    caller: Webview,
    state: State<'_, GithubState>,
    input: PrepareSitePublishInput,
) -> Result<PublishReview, String> {
    require_local_shell(&caller)?;
    if state.publishing.load(Ordering::Acquire) {
        return Err("A publication is already in progress.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    let repository = state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let plan = build_site_publication_plan(&state, &bundle.access_token, input, &snapshot).await?;
    let review = review_from_plan(&plan, &repository.branch);
    *state.pending_publish.lock().map_err(|_| "The publication review could not be stored.".to_string())? = Some(plan);
    Ok(review)
}

#[tauri::command]
pub async fn github_analyze_page_delete(
    caller: Webview,
    state: State<'_, GithubState>,
    source: PublishedSourceIdentity,
) -> Result<PageDeleteAnalysis, String> {
    require_local_shell(&caller)?;
    validate_page_source_identity(&source)?;
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    analyze_page_delete(&state, &bundle.access_token, &snapshot, &source).await
}

#[tauri::command]
pub async fn github_prepare_page_delete(
    caller: Webview,
    state: State<'_, GithubState>,
    input: PreparePageDeleteInput,
) -> Result<PublishReview, String> {
    require_local_shell(&caller)?;
    if state.publishing.load(Ordering::Acquire) {
        return Err("A publication is already in progress.".to_string());
    }
    if !valid_draft_id(&input.source_draft_id) {
        return Err("The source draft identifier is invalid.".to_string());
    }
    let source = PublishedSourceIdentity {
        path: input.path.clone(),
        slug: input.slug.clone(),
        commit_sha: input.commit_sha.clone(),
        blob_sha: input.blob_sha.clone(),
    };
    validate_page_source_identity(&source)?;
    if source.slug == "home" {
        return Err("Homepage cannot be deleted.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    let repository = state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let analysis = analyze_page_delete(&state, &bundle.access_token, &snapshot, &source).await?;
    if input.title != analysis.title || input.confirmation != analysis.title {
        return Err("Type the exact published page title to confirm deletion.".to_string());
    }
    let blocking: Vec<_> = analysis.dependencies.iter().filter(|item| !item.auto_removable).collect();
    if !blocking.is_empty() {
        return Err(format!(
            "Deletion is blocked by structured references in: {}",
            blocking.iter().map(|item| item.path.as_str()).collect::<Vec<_>>().join(", ")
        ));
    }
    let plan = build_page_delete_plan(&snapshot, &analysis, &input.source_draft_id)?;
    let review = review_from_plan(&plan, &repository.branch);
    *state.pending_publish.lock().map_err(|_| "The deletion review could not be stored.".to_string())? = Some(plan);
    Ok(review)
}

#[tauri::command]
pub async fn github_prepare_page_publish(
    caller: Webview,
    state: State<'_, GithubState>,
    input: PreparePagePublishInput,
) -> Result<PublishReview, String> {
    require_local_shell(&caller)?;
    if state.publishing.load(Ordering::Acquire) {
        return Err("A publication is already in progress.".to_string());
    }
    let bundle = state.ready_access_token().await?;
    let repository = state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let plan = build_page_publication_plan(&state, &bundle.access_token, input, &snapshot).await?;
    let review = review_from_plan(&plan, &repository.branch);
    *state.pending_publish.lock().map_err(|_| "The publication review could not be stored.".to_string())? = Some(plan);
    Ok(review)
}

#[tauri::command]
pub async fn github_analyze_recipe_delete(
    caller: Webview,
    state: State<'_, GithubState>,
    source: PublishedSourceIdentity,
) -> Result<DeleteAnalysis, String> {
    require_local_shell(&caller)?;
    validate_source_identity(&source)?;
    let bundle = state.ready_access_token().await?;
    state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    analyze_recipe_delete(&state, &bundle.access_token, &snapshot, &source).await
}

#[tauri::command]
pub async fn github_prepare_recipe_delete(
    caller: Webview,
    state: State<'_, GithubState>,
    input: PrepareDeleteInput,
) -> Result<PublishReview, String> {
    require_local_shell(&caller)?;
    if state.publishing.load(Ordering::Acquire) {
        return Err("A recipe publication is already in progress.".to_string());
    }
    let source = PublishedSourceIdentity {
        path: input.path.clone(),
        slug: input.slug.clone(),
        commit_sha: input.commit_sha.clone(),
        blob_sha: input.blob_sha.clone(),
    };
    if !valid_draft_id(&input.source_draft_id) {
        return Err("The source draft identifier is invalid.".to_string());
    }
    validate_source_identity(&source)?;
    let bundle = state.ready_access_token().await?;
    let repository = state.verify_repository(&bundle.access_token).await?;
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let analysis = analyze_recipe_delete(&state, &bundle.access_token, &snapshot, &source).await?;
    if input.title != analysis.title || input.confirmation != analysis.title {
        return Err("Type the exact published recipe title to confirm deletion.".to_string());
    }
    let blocking: Vec<_> = analysis
        .dependencies
        .iter()
        .filter(|dependency| !dependency.auto_removable)
        .collect();
    if !blocking.is_empty() {
        return Err(format!(
            "Deletion is blocked by structured references in: {}",
            blocking
                .iter()
                .map(|dependency| dependency.path.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if input.delete_unique_image && (!analysis.image_unique || analysis.image_path.is_none()) {
        return Err(
            "The recipe image is shared, remote, missing, or otherwise unsafe to delete."
                .to_string(),
        );
    }
    let plan = build_delete_plan(
        &state,
        &bundle.access_token,
        &snapshot,
        &analysis,
        &input.source_draft_id,
        input.delete_unique_image,
    )
    .await?;
    let review = review_from_plan(&plan, &repository.branch);
    *state
        .pending_publish
        .lock()
        .map_err(|_| "The deletion review could not be stored.".to_string())? = Some(plan);
    Ok(review)
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
    let snapshot = state.repository_snapshot(&bundle.access_token).await?;
    let plan = build_publication_plan(&state, &bundle.access_token, input, &snapshot).await?;
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
    let latest = state.repository_snapshot(&bundle.access_token).await?;
    for expectation in &plan.expectations {
        let actual = latest
            .entries
            .get(&expectation.path)
            .filter(|entry| entry.kind == "blob" && entry.mode == "100644")
            .map(|entry| entry.sha.clone());
        if actual != expectation.sha {
            clear_publish_plan(&state)?;
            return Err("This recipe changed in GitHub after the draft or review was created. Reload the published version or keep the draft as a copy.".to_string());
        }
    }

    let mut tree_entries = Vec::with_capacity(plan.changes.len());
    let mut recipe_blob_sha = None;
    for change in &plan.changes {
        let sha = match &change.file {
            Some(file) => Some(state.create_blob(&bundle.access_token, file).await?),
            None => None,
        };
        if plan.recipe_path.as_deref() == Some(change.path.as_str())
            && change.operation != ChangeOperation::Delete
        {
            recipe_blob_sha = sha.clone();
        }
        tree_entries.push(json!({
            "path": change.path,
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
            .json(&json!({ "base_tree": latest.tree_sha, "tree": tree_entries }))
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
                "message": plan.commit_message.clone(),
                "tree": tree.sha,
                "parents": [latest.commit_sha.clone()],
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
        operation: plan.operation,
        recipe_path: plan.recipe_path,
        recipe_blob_sha,
        recipe_json: plan.recipe_json,
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

fn recipe_path(slug: &str) -> String {
    format!("src/content/recipes/{slug}.json")
}

fn page_path(slug: &str) -> String {
    format!("src/content/pages/{slug}.json")
}

fn page_slug_from_path(path: &str) -> Option<&str> {
    path.strip_prefix("src/content/pages/")
        .and_then(|value| value.strip_suffix(".json"))
        .filter(|slug| valid_slug(slug))
}

fn valid_block_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn allowed_page_child(parent: &str, child: &str) -> bool {
    let content = matches!(
        child,
        "hero" | "heading" | "text" | "rich-text" | "image" | "divider" | "spacer"
            | "button" | "search" | "recipe-grid" | "featured-recipes" | "latest-recipes"
            | "category-grid" | "random-recipe" | "global-reference"
    );
    match parent {
        "section" => content || matches!(child, "container" | "columns" | "grid"),
        "container" => content || matches!(child, "columns" | "grid"),
        "columns" => child == "column",
        "column" | "grid" => content,
        _ => false,
    }
}

fn allowed_page_data_key(block_type: &str, key: &str) -> bool {
    match block_type {
        "section" | "container" | "columns" | "grid" => key == "blocks",
        "column" => matches!(key, "blocks" | "span"),
        "hero" => matches!(key, "eyebrow" | "title" | "body" | "showSearch" | "searchPlaceholder" | "showRandomRecipe" | "secondaryAction" | "quickLinks"),
        "heading" => matches!(key, "text" | "level"),
        "text" => key == "text",
        "rich-text" => key == "nodes",
        "image" => matches!(key, "src" | "alt" | "caption" | "loading" | "attachmentId"),
        "divider" => false,
        "spacer" => key == "size",
        "button" => matches!(key, "label" | "href" | "target"),
        "search" => matches!(key, "label" | "placeholder" | "buttonLabel"),
        "recipe-grid" => matches!(key, "eyebrow" | "heading" | "source" | "slugs" | "category" | "tag" | "limit" | "columns"),
        "featured-recipes" => matches!(key, "eyebrow" | "heading" | "slugs" | "limit"),
        "latest-recipes" => matches!(key, "eyebrow" | "heading" | "limit"),
        "category-grid" => matches!(key, "eyebrow" | "heading" | "slugs"),
        "random-recipe" => key == "label",
        "global-reference" => key == "globalId",
        _ => false,
    }
}

fn validate_page_layout_map(value: &Map<String, Value>, responsive: bool) -> Result<(), String> {
    for key in value.keys() {
        if !matches!(key.as_str(), "width" | "columns" | "gap" | "paddingBlock" | "align" | "visible")
            || (!responsive && key == "visible")
        {
            return Err("A page block contains unsupported layout settings.".to_string());
        }
    }
    if value.get("width").and_then(Value::as_str).is_some_and(|item| !matches!(item, "narrow" | "medium" | "wide" | "full")) {
        return Err("A page block contains an invalid width.".to_string());
    }
    if value.get("columns").and_then(Value::as_u64).is_some_and(|item| !(1..=4).contains(&item)) {
        return Err("A page grid contains an invalid column count.".to_string());
    }
    for key in ["gap", "paddingBlock"] {
        if value.get(key).and_then(Value::as_str).is_some_and(|item| !matches!(item, "none" | "xs" | "sm" | "md" | "lg" | "xl")) {
            return Err("A page block contains invalid spacing.".to_string());
        }
    }
    if value.get("align").and_then(Value::as_str).is_some_and(|item| !matches!(item, "start" | "center" | "end" | "stretch")) {
        return Err("A page block contains invalid alignment.".to_string());
    }
    if value.get("visible").is_some_and(|item| !item.is_boolean()) {
        return Err("Page visibility settings must be boolean.".to_string());
    }
    Ok(())
}

fn validate_page_block(
    value: &Value,
    parent: Option<&str>,
    depth: usize,
    ids: &mut HashSet<String>,
) -> Result<(), String> {
    if depth > 5 {
        return Err("Page block nesting exceeds the supported depth.".to_string());
    }
    let block = value.as_object().ok_or_else(|| "Every page block must be an object.".to_string())?;
    if block.keys().any(|key| !PAGE_BLOCK_KEYS.contains(&key.as_str())) {
        return Err("A page block contains unsupported fields.".to_string());
    }
    let id = string_field(block, "id").filter(|id| valid_block_id(id)).ok_or_else(|| "A page block identifier is invalid.".to_string())?;
    if !ids.insert(id.to_string()) {
        return Err("Page block identifiers must be unique.".to_string());
    }
    let block_type = string_field(block, "type").filter(|kind| PAGE_BLOCK_TYPES.contains(kind)).ok_or_else(|| "A page block type is not approved.".to_string())?;
    if let Some(parent) = parent {
        if !allowed_page_child(parent, block_type) {
            return Err(format!("A {block_type} block cannot be nested inside {parent}."));
        }
    }
    let data = block.get("data").and_then(Value::as_object).ok_or_else(|| "Every page block requires structured data.".to_string())?;
    if data.keys().any(|key| !allowed_page_data_key(block_type, key)) {
        return Err(format!("A {block_type} block contains unsupported data."));
    }
    if let Some(layout) = block.get("layout") {
        validate_page_layout_map(layout.as_object().ok_or_else(|| "Page block layout must be an object.".to_string())?, false)?;
    }
    if let Some(responsive) = block.get("responsive") {
        let responsive = responsive.as_object().ok_or_else(|| "Page responsive settings must be an object.".to_string())?;
        for (breakpoint, settings) in responsive {
            if !matches!(breakpoint.as_str(), "desktop" | "tablet" | "mobile") {
                return Err("A page uses an unsupported breakpoint.".to_string());
            }
            validate_page_layout_map(settings.as_object().ok_or_else(|| "Breakpoint settings must be an object.".to_string())?, true)?;
        }
    }
    if let Some(style) = block.get("style") {
        let style = style.as_object().ok_or_else(|| "Page block style must be an object.".to_string())?;
        if style.keys().any(|key| !matches!(key.as_str(), "tone" | "surface" | "radius")) {
            return Err("A page block contains unsupported style controls.".to_string());
        }
    }
    let layout_block = matches!(block_type, "section" | "container" | "columns" | "column" | "grid");
    if layout_block {
        let children = data.get("blocks").and_then(Value::as_array).ok_or_else(|| format!("A {block_type} block requires child blocks."))?;
        if block_type == "columns" && !(2..=4).contains(&children.len()) {
            return Err("Columns must contain two to four columns.".to_string());
        }
        for child in children {
            validate_page_block(child, Some(block_type), depth + 1, ids)?;
        }
        if block_type == "columns" {
            for breakpoint in ["desktop", "tablet"] {
                let total: u64 = children.iter().filter_map(|child| child.get("data")?.get("span")?.get(breakpoint)?.as_u64()).sum();
                if total != 12 { return Err(format!("Column spans at {breakpoint} must total 12.")); }
            }
            if children.iter().any(|child| child.get("data").and_then(|data| data.get("span")).and_then(|span| span.get("mobile")).and_then(Value::as_u64) != Some(12)) {
                return Err("Columns must stack at full width on mobile.".to_string());
            }
        }
    }
    Ok(())
}

fn page_has_primary_heading(value: &Value) -> bool {
    let Some(block) = value.as_object() else { return false; };
    let block_type = string_field(block, "type").unwrap_or_default();
    let data = block.get("data").and_then(Value::as_object);
    if block_type == "hero" && data.and_then(|item| item.get("title")).and_then(Value::as_str).is_some_and(|text| !text.trim().is_empty()) { return true; }
    if block_type == "heading" && data.and_then(|item| item.get("level")).and_then(Value::as_u64) == Some(1) { return true; }
    data.and_then(|item| item.get("blocks")).and_then(Value::as_array).is_some_and(|children| children.iter().any(page_has_primary_heading))
}

fn validate_repository_page(value: &Value, expected_slug: &str) -> Result<(), String> {
    if value_contains_unsafe_string(value) {
        return Err("The page contains an unsafe URL or control value.".to_string());
    }
    let page = value.as_object().ok_or_else(|| "The page source must be a JSON object.".to_string())?;
    if page.keys().any(|key| !PAGE_SOURCE_KEYS.contains(&key.as_str())) {
        return Err("The page contains unsupported source fields.".to_string());
    }
    let id = string_field(page, "id").filter(|value| valid_block_id(value)).ok_or_else(|| "The page identifier is invalid.".to_string())?;
    let slug = string_field(page, "slug").filter(|value| valid_slug(value)).ok_or_else(|| "The page slug is invalid.".to_string())?;
    if slug != expected_slug { return Err("The page slug does not match its source path.".to_string()); }
    let page_type = string_field(page, "pageType").filter(|value| matches!(*value, "home" | "standard" | "landing")).ok_or_else(|| "The page type is invalid.".to_string())?;
    if (page_type == "home") != (slug == "home" && id == "home") {
        return Err("Homepage identity is invalid.".to_string());
    }
    if string_field(page, "title").is_none_or(|value| value.trim().is_empty() || value.len() > 200) {
        return Err("The page title is invalid.".to_string());
    }
    if string_field(page, "description").is_none_or(|value| value.len() > 320) {
        return Err("The page description is invalid.".to_string());
    }
    if string_field(page, "status") != Some("published") {
        return Err("Only published page sources may be committed.".to_string());
    }
    let layout = page.get("layout").and_then(Value::as_object).ok_or_else(|| "The page layout is required.".to_string())?;
    if layout.len() != 2 || layout.get("modelVersion").and_then(Value::as_u64) != Some(1) {
        return Err("The page layout must use model version 1.".to_string());
    }
    let blocks = layout.get("blocks").and_then(Value::as_array).filter(|items| !items.is_empty()).ok_or_else(|| "The page layout must contain at least one section.".to_string())?;
    let mut ids = HashSet::new();
    for block in blocks {
        if block.get("type").and_then(Value::as_str) != Some("section") { return Err("Page root blocks must be sections.".to_string()); }
        validate_page_block(block, None, 0, &mut ids)?;
    }
    if page_type == "home" && !blocks.iter().any(page_has_primary_heading) {
        return Err("Homepage requires a visible primary heading.".to_string());
    }
    Ok(())
}

async fn published_page_from_entry(
    state: &GithubState,
    token: &str,
    snapshot: &RepositorySnapshot,
    entry: &GitTreeEntry,
) -> Result<PublishedPage, String> {
    let slug = page_slug_from_path(&entry.path).ok_or_else(|| "The repository page path is invalid.".to_string())?;
    let value = repository_json_value(state, token, entry).await?;
    validate_repository_page(&value, slug)?;
    let page = value.as_object().ok_or_else(|| "The page source must be an object.".to_string())?;
    let mut source_json = serde_json::to_string_pretty(&value).map_err(|_| "The published page source could not be normalized.".to_string())?;
    source_json.push('\n');
    Ok(PublishedPage {
        path: entry.path.clone(),
        slug: slug.to_string(),
        id: string_field(page, "id").unwrap_or(slug).to_string(),
        title: string_field(page, "title").unwrap_or(slug).to_string(),
        page_type: string_field(page, "pageType").unwrap_or("standard").to_string(),
        commit_sha: snapshot.commit_sha.clone(),
        blob_sha: entry.sha.clone(),
        source_json,
    })
}

fn validate_page_source_identity(source: &PublishedSourceIdentity) -> Result<(), String> {
    if !valid_slug(&source.slug)
        || source.path != page_path(&source.slug)
        || !valid_sha(&source.commit_sha)
        || !valid_sha(&source.blob_sha)
    {
        return Err("The published page source identity is invalid.".to_string());
    }
    Ok(())
}

fn recipe_slug_from_path(path: &str) -> Option<&str> {
    path.strip_prefix("src/content/recipes/")
        .and_then(|value| value.strip_suffix(".json"))
        .filter(|slug| valid_slug(slug))
}

fn snapshot_blob<'a>(snapshot: &'a RepositorySnapshot, path: &str) -> Option<&'a GitTreeEntry> {
    snapshot
        .entries
        .get(path)
        .filter(|entry| entry.kind == "blob" && entry.mode == "100644")
}

async fn repository_json_value(
    state: &GithubState,
    token: &str,
    entry: &GitTreeEntry,
) -> Result<Value, String> {
    let bytes = state
        .read_blob(token, &entry.sha, MAX_RECIPE_JSON_BYTES)
        .await?;
    serde_json::from_slice(&bytes).map_err(|_| format!("{} is not valid JSON.", entry.path))
}

fn validate_repository_recipe(value: &Value, expected_slug: &str) -> Result<(), String> {
    if value_contains_unsafe_string(value) {
        return Err("The published recipe contains an unsafe URL or control value.".to_string());
    }
    let recipe = value
        .as_object()
        .ok_or_else(|| "The published recipe source must be a JSON object.".to_string())?;
    if recipe
        .keys()
        .any(|key| !RECIPE_SOURCE_KEYS.contains(&key.as_str()))
    {
        return Err("The published recipe contains unsupported source fields.".to_string());
    }
    if string_field(recipe, "slug") != Some(expected_slug) {
        return Err("The published recipe slug does not match its source path.".to_string());
    }
    if string_field(recipe, "title").is_none_or(|value| value.trim().is_empty())
        && string_field(recipe, "name").is_none_or(|value| value.trim().is_empty())
    {
        return Err("The published recipe has no title.".to_string());
    }
    if string_field(recipe, "category").is_none_or(|value| value.trim().is_empty()) {
        return Err("The published recipe has no category.".to_string());
    }
    validate_non_empty_string_array(recipe.get("ingredients"), "ingredients")?;
    if recipe.get("steps").is_some() {
        validate_non_empty_string_array(recipe.get("steps"), "steps")?;
    } else {
        validate_non_empty_string_array(recipe.get("preparation"), "preparation")?;
    }
    Ok(())
}

async fn published_recipe_from_entry(
    state: &GithubState,
    token: &str,
    snapshot: &RepositorySnapshot,
    entry: &GitTreeEntry,
) -> Result<PublishedRecipe, String> {
    let slug = recipe_slug_from_path(&entry.path)
        .ok_or_else(|| "The repository recipe path is invalid.".to_string())?;
    let value = repository_json_value(state, token, entry).await?;
    validate_repository_recipe(&value, slug)?;
    let recipe = value
        .as_object()
        .ok_or_else(|| "The published recipe source must be an object.".to_string())?;
    let title = string_field(recipe, "title")
        .or_else(|| string_field(recipe, "name"))
        .unwrap_or(slug)
        .to_string();
    let category = string_field(recipe, "category")
        .unwrap_or_default()
        .to_string();
    let image_path = string_field(recipe, "image").map(ToOwned::to_owned);
    let mut source_json = serde_json::to_string_pretty(&value)
        .map_err(|_| "The published recipe source could not be normalized.".to_string())?;
    source_json.push('\n');
    Ok(PublishedRecipe {
        path: entry.path.clone(),
        slug: slug.to_string(),
        title,
        category,
        image_path,
        commit_sha: snapshot.commit_sha.clone(),
        blob_sha: entry.sha.clone(),
        source_json,
    })
}

fn validate_source_identity(source: &PublishedSourceIdentity) -> Result<(), String> {
    if !valid_slug(&source.slug)
        || source.path != recipe_path(&source.slug)
        || !valid_sha(&source.commit_sha)
        || !valid_sha(&source.blob_sha)
    {
        return Err("The published recipe source identity is invalid.".to_string());
    }
    Ok(())
}

async fn read_aliases(
    state: &GithubState,
    token: &str,
    snapshot: &RepositorySnapshot,
) -> Result<(BTreeMap<String, String>, Option<String>), String> {
    let Some(entry) = snapshot_blob(snapshot, "src/content/aliases.json") else {
        return Ok((BTreeMap::new(), None));
    };
    let value = repository_json_value(state, token, entry).await?;
    let object = value
        .as_object()
        .ok_or_else(|| "src/content/aliases.json must contain an object.".to_string())?;
    let mut aliases = BTreeMap::new();
    for (alias, target) in object {
        let target = target
            .as_str()
            .filter(|value| valid_slug(value))
            .ok_or_else(|| "src/content/aliases.json contains an invalid target.".to_string())?;
        if !valid_slug(alias) {
            return Err("src/content/aliases.json contains an invalid alias.".to_string());
        }
        aliases.insert(alias.clone(), target.to_string());
    }
    Ok((aliases, Some(entry.sha.clone())))
}

fn value_references_recipe(value: &Value, slug: &str, source_path: &str) -> bool {
    match value {
        Value::String(text) => {
            let normalized = text.trim().trim_start_matches('/').trim_end_matches('/');
            normalized == slug
                || normalized == source_path
                || normalized == format!("retete/{slug}")
                || normalized == format!("recipes/{slug}")
                || normalized.ends_with(&format!("/retete/{slug}"))
                || normalized.ends_with(&format!("/recipes/{slug}"))
        }
        Value::Array(items) => items
            .iter()
            .any(|item| value_references_recipe(item, slug, source_path)),
        Value::Object(map) => map
            .values()
            .any(|item| value_references_recipe(item, slug, source_path)),
        _ => false,
    }
}

async fn analyze_recipe_delete(
    state: &GithubState,
    token: &str,
    snapshot: &RepositorySnapshot,
    source: &PublishedSourceIdentity,
) -> Result<DeleteAnalysis, String> {
    validate_source_identity(source)?;
    let current = snapshot_blob(snapshot, &source.path)
        .ok_or_else(|| "This published recipe no longer exists.".to_string())?;
    if current.sha != source.blob_sha {
        return Err("This recipe changed in GitHub after it was loaded. Reload the published version before deleting it.".to_string());
    }
    let published = published_recipe_from_entry(state, token, snapshot, current).await?;
    let mut dependencies = Vec::new();
    let (aliases, _) = read_aliases(state, token, snapshot).await?;
    let matching_aliases: Vec<_> = aliases
        .iter()
        .filter(|(_, target)| *target == &source.slug)
        .map(|(alias, _)| alias.clone())
        .collect();
    if !matching_aliases.is_empty() {
        dependencies.push(RecipeDependency {
            path: "src/content/aliases.json".to_string(),
            reason: format!(
                "Aliases removed automatically: {}",
                matching_aliases.join(", ")
            ),
            auto_removable: true,
        });
    }

    let mut json_entries: Vec<_> = snapshot
        .entries
        .values()
        .filter(|entry| {
            entry.path.starts_with("src/content/")
                && entry.path.ends_with(".json")
                && entry.path != source.path
                && entry.path != "src/content/aliases.json"
                && entry.kind == "blob"
                && entry.mode == "100644"
        })
        .cloned()
        .collect();
    json_entries.sort_by(|left, right| left.path.cmp(&right.path));
    for entry in json_entries {
        let value = repository_json_value(state, token, &entry).await?;
        if value_references_recipe(&value, &source.slug, &source.path) {
            dependencies.push(RecipeDependency {
                path: entry.path,
                reason: "Structured content references this recipe.".to_string(),
                auto_removable: false,
            });
        }
    }

    let image_path = published.image_path.clone();
    let mut image_references = HashSet::new();
    if let Some(path) = &image_path {
        for entry in snapshot.entries.values().filter(|entry| {
            recipe_slug_from_path(&entry.path).is_some()
                && entry.kind == "blob"
                && entry.mode == "100644"
        }) {
            let value = repository_json_value(state, token, entry).await?;
            if value
                .as_object()
                .and_then(|recipe| string_field(recipe, "image"))
                == Some(path.as_str())
            {
                image_references.insert(entry.path.clone());
            }
        }
    }
    let image_unique = image_path.as_ref().is_some_and(|path| {
        allowed_recipe_image_path(path)
            && snapshot_blob(snapshot, path).is_some()
            && image_references.len() == 1
            && image_references.contains(&source.path)
    });

    Ok(DeleteAnalysis {
        path: published.path,
        slug: published.slug,
        title: published.title,
        image_path,
        image_unique,
        commit_sha: snapshot.commit_sha.clone(),
        blob_sha: current.sha.clone(),
        dependencies,
    })
}

async fn build_delete_plan(
    state: &GithubState,
    token: &str,
    snapshot: &RepositorySnapshot,
    analysis: &DeleteAnalysis,
    source_draft_id: &str,
    delete_unique_image: bool,
) -> Result<PendingPublishPlan, String> {
    let mut changes = vec![PublicationChange {
        operation: ChangeOperation::Delete,
        path: analysis.path.clone(),
        file: None,
    }];
    let mut expectations =
        BTreeMap::from([(analysis.path.clone(), Some(analysis.blob_sha.clone()))]);
    let (mut aliases, alias_sha) = read_aliases(state, token, snapshot).await?;
    let alias_count = aliases.len();
    aliases.retain(|_, target| target != &analysis.slug);
    if aliases.len() != alias_count {
        let path = "src/content/aliases.json".to_string();
        expectations.insert(path.clone(), alias_sha.clone());
        let value = serde_json::to_value(aliases)
            .map_err(|_| "Recipe aliases could not be serialized.".to_string())?;
        changes.push(PublicationChange {
            operation: ChangeOperation::Modify,
            path: path.clone(),
            file: Some(json_file(path, &value)?),
        });
    }
    if delete_unique_image {
        let image_path = analysis
            .image_path
            .as_ref()
            .filter(|_| analysis.image_unique)
            .ok_or_else(|| "The recipe image is not safe to delete.".to_string())?;
        let image = snapshot_blob(snapshot, image_path)
            .ok_or_else(|| "The recipe image no longer exists.".to_string())?;
        expectations.insert(image_path.clone(), Some(image.sha.clone()));
        changes.push(PublicationChange {
            operation: ChangeOperation::Delete,
            path: image_path.clone(),
            file: None,
        });
    }
    Ok(PendingPublishPlan {
        id: Uuid::new_v4().to_string(),
        source_draft_id: source_draft_id.to_string(),
        recipe_title: analysis.title.clone(),
        recipe_slug: analysis.slug.clone(),
        base_commit_sha: snapshot.commit_sha.clone(),
        operation: "delete".to_string(),
        changes,
        expectations: expectations
            .into_iter()
            .map(|(path, sha)| PathExpectation { path, sha })
            .collect(),
        image_path: analysis.image_path.clone(),
        recipe_path: None,
        recipe_json: None,
        commit_message: format!("cms: delete recipe {}", analysis.slug),
        created_at: now_seconds(),
    })
}

fn value_references_page(value: &Value, slug: &str, source_path: &str) -> bool {
    match value {
        Value::String(text) => {
            let normalized = text.trim().trim_start_matches('/').trim_end_matches('/');
            normalized == source_path
                || (slug == "home" && (normalized.is_empty() || normalized == "index.html"))
                || (slug != "home" && normalized == slug)
        }
        Value::Array(items) => items.iter().any(|item| value_references_page(item, slug, source_path)),
        Value::Object(map) => map.values().any(|item| value_references_page(item, slug, source_path)),
        _ => false,
    }
}

async fn analyze_page_delete(
    state: &GithubState,
    token: &str,
    snapshot: &RepositorySnapshot,
    source: &PublishedSourceIdentity,
) -> Result<PageDeleteAnalysis, String> {
    validate_page_source_identity(source)?;
    if source.slug == "home" {
        return Err("Homepage cannot be deleted.".to_string());
    }
    let current = snapshot_blob(snapshot, &source.path).ok_or_else(|| "This published page no longer exists.".to_string())?;
    if current.sha != source.blob_sha {
        return Err("This page changed in GitHub after it was loaded. Reload it before deleting.".to_string());
    }
    let published = published_page_from_entry(state, token, snapshot, current).await?;
    let mut dependencies = Vec::new();
    let mut entries: Vec<_> = snapshot.entries.values().filter(|entry| {
        entry.path.starts_with("src/content/")
            && entry.path.ends_with(".json")
            && entry.path != source.path
            && entry.kind == "blob"
            && entry.mode == "100644"
    }).cloned().collect();
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    for entry in entries {
        let value = repository_json_value(state, token, &entry).await?;
        if value_references_page(&value, &source.slug, &source.path) {
            dependencies.push(RecipeDependency {
                path: entry.path,
                reason: "Structured content links to this page.".to_string(),
                auto_removable: false,
            });
        }
    }
    Ok(PageDeleteAnalysis {
        path: published.path,
        slug: published.slug,
        id: published.id,
        title: published.title,
        page_type: published.page_type,
        commit_sha: snapshot.commit_sha.clone(),
        blob_sha: current.sha.clone(),
        dependencies,
    })
}

fn build_page_delete_plan(
    snapshot: &RepositorySnapshot,
    analysis: &PageDeleteAnalysis,
    source_draft_id: &str,
) -> Result<PendingPublishPlan, String> {
    if analysis.slug == "home" || analysis.page_type == "home" {
        return Err("Homepage cannot be deleted.".to_string());
    }
    Ok(PendingPublishPlan {
        id: Uuid::new_v4().to_string(),
        source_draft_id: source_draft_id.to_string(),
        recipe_title: analysis.title.clone(),
        recipe_slug: analysis.slug.clone(),
        base_commit_sha: snapshot.commit_sha.clone(),
        operation: "delete".to_string(),
        changes: vec![PublicationChange { operation: ChangeOperation::Delete, path: analysis.path.clone(), file: None }],
        expectations: vec![PathExpectation { path: analysis.path.clone(), sha: Some(analysis.blob_sha.clone()) }],
        image_path: None,
        recipe_path: None,
        recipe_json: None,
        commit_message: format!("cms: delete page {}", analysis.slug),
        created_at: now_seconds(),
    })
}

fn json_file(path: String, value: &Value) -> Result<PublicationFile, String> {
    let mut bytes = serde_json::to_string_pretty(value)
        .map_err(|_| "Repository JSON could not be serialized.".to_string())?
        .into_bytes();
    bytes.push(b'\n');
    Ok(PublicationFile {
        path,
        bytes,
        encoding: BlobEncoding::Utf8,
    })
}

fn image_file(input: &PublishImageInput, slug: &str) -> Result<(String, PublicationFile), String> {
    let bytes = BASE64
        .decode(&input.bytes_base64)
        .map_err(|_| "The local recipe image could not be decoded.".to_string())?;
    let extension = validate_image(&bytes, &input.mime_type)?;
    let path = format!("assets/images/recipes/{slug}.{extension}");
    if !allowed_publication_path(&path) {
        return Err("The generated recipe image path is not allowed.".to_string());
    }
    Ok((
        path.clone(),
        PublicationFile {
            path,
            bytes,
            encoding: BlobEncoding::Base64,
        },
    ))
}

fn page_image_file(input: &PublishPageImageInput, slug: &str) -> Result<(String, PublicationFile), String> {
    if !valid_block_id(&input.block_id) {
        return Err("The page image block identifier is invalid.".to_string());
    }
    let bytes = BASE64.decode(&input.bytes_base64).map_err(|_| "A local page image could not be decoded.".to_string())?;
    let extension = validate_image(&bytes, &input.mime_type)?;
    let path = format!("assets/images/pages/{slug}-{}.{}", input.block_id, extension);
    if !allowed_publication_path(&path) {
        return Err("The generated page image path is not allowed.".to_string());
    }
    Ok((path.clone(), PublicationFile { path, bytes, encoding: BlobEncoding::Base64 }))
}

fn value_contains_exact_string(value: &Value, expected: &str) -> bool {
    match value {
        Value::String(text) => text == expected,
        Value::Array(items) => items.iter().any(|item| value_contains_exact_string(item, expected)),
        Value::Object(map) => map.values().any(|item| value_contains_exact_string(item, expected)),
        _ => false,
    }
}

fn rewrite_page_image_blocks(
    value: &mut Value,
    replacements: &HashMap<String, String>,
    seen: &mut HashSet<String>,
) -> Result<(), String> {
    let Some(block) = value.as_object_mut() else { return Err("A page block must be an object.".to_string()); };
    let block_id = block.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
    let block_type = block.get("type").and_then(Value::as_str).unwrap_or_default().to_string();
    let data = block.get_mut("data").and_then(Value::as_object_mut).ok_or_else(|| "A page block requires data.".to_string())?;
    if block_type == "image" {
        if let Some(path) = replacements.get(&block_id) {
            if data.get("attachmentId").and_then(Value::as_str) != Some(block_id.as_str()) {
                return Err("A selected page image does not match its image block.".to_string());
            }
            data.insert("src".to_string(), Value::String(path.clone()));
            data.remove("attachmentId");
            seen.insert(block_id.clone());
        } else if data.get("attachmentId").is_some() {
            return Err(format!("Select the local image for block {block_id} on this device."));
        }
    }
    if let Some(children) = data.get_mut("blocks").and_then(Value::as_array_mut) {
        for child in children { rewrite_page_image_blocks(child, replacements, seen)?; }
    }
    Ok(())
}

fn repository_route_uses_slug(value: &Value, slug: &str) -> bool {
    value.as_array().is_some_and(|items| items.iter().any(|item| {
        item.get("slug").and_then(Value::as_str) == Some(slug)
    }))
}

async fn build_site_publication_plan(
    state: &GithubState,
    token: &str,
    input: PrepareSitePublishInput,
    snapshot: &RepositorySnapshot,
) -> Result<PendingPublishPlan, String> {
    if !(valid_draft_id(&input.source_draft_id) || input.source_draft_id == "site-management") {
        return Err("The site draft identifier is invalid.".to_string());
    }
    if !SITE_PUBLISH_AREAS.contains(&input.area.as_str()) {
        return Err("The site publication area is not approved.".to_string());
    }
    if input.files.is_empty() || input.files.len() > 100 {
        return Err("The site publication baseline is incomplete or too large.".to_string());
    }
    let expected_paths: HashSet<String> = SITE_SOURCE_PATHS.iter().map(|path| (*path).to_string())
        .chain(snapshot.entries.keys().filter(|path| {
            recipe_slug_from_path(path).is_some() || page_slug_from_path(path).is_some()
        }).cloned())
        .collect();
    let submitted_paths: HashSet<String> = input.files.iter().map(|file| file.path.clone()).collect();
    if submitted_paths.len() != input.files.len() || submitted_paths != expected_paths {
        return Err("Reload the complete site configuration from GitHub before publishing.".to_string());
    }

    let mut files = input.files;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    let mut changes = Vec::new();
    let mut expectations = Vec::with_capacity(files.len());
    for file in files {
        if !allowed_site_management_path(&file.path) || !valid_sha(&file.blob_sha) {
            return Err("A site publication file is outside the approved source paths.".to_string());
        }
        if file.source_json.len() > MAX_RECIPE_JSON_BYTES {
            return Err(format!("{} is too large to publish.", file.path));
        }
        let current = snapshot_blob(snapshot, &file.path)
            .ok_or_else(|| format!("{} no longer exists in GitHub.", file.path))?;
        if current.sha != file.blob_sha {
            return Err(format!("{} changed in GitHub after this draft began. Reload the site draft before publishing.", file.path));
        }
        let current_value = repository_json_value(state, token, current).await?;
        let next_value: Value = serde_json::from_str(&file.source_json)
            .map_err(|_| format!("{} is not valid JSON.", file.path))?;
        validate_site_source_value(&file.path, &next_value)?;
        expectations.push(PathExpectation { path: file.path.clone(), sha: Some(current.sha.clone()) });
        if current_value != next_value {
            changes.push(PublicationChange {
                operation: ChangeOperation::Modify,
                path: file.path.clone(),
                file: Some(json_file(file.path, &next_value)?),
            });
        }
    }
    if changes.is_empty() {
        return Err("This site draft does not contain any changes to publish.".to_string());
    }
    let commit_message = match input.area.as_str() {
        "templates" => "cms: update site templates",
        "global-blocks" => "cms: update global blocks",
        "navigation" => "cms: update site navigation",
        "taxonomies" => "cms: update categories and tags",
        "theme" => "cms: update site theme",
        "settings" => "cms: update site settings",
        _ => "cms: update site configuration",
    };
    Ok(PendingPublishPlan {
        id: Uuid::new_v4().to_string(),
        source_draft_id: input.source_draft_id,
        recipe_title: "Site management".to_string(),
        recipe_slug: "site-management".to_string(),
        base_commit_sha: snapshot.commit_sha.clone(),
        operation: "update".to_string(),
        changes,
        expectations,
        image_path: None,
        recipe_path: None,
        recipe_json: None,
        commit_message: commit_message.to_string(),
        created_at: now_seconds(),
    })
}

async fn build_page_publication_plan(
    state: &GithubState,
    token: &str,
    input: PreparePagePublishInput,
    snapshot: &RepositorySnapshot,
) -> Result<PendingPublishPlan, String> {
    if !valid_draft_id(&input.source_draft_id) { return Err("The source draft identifier is invalid.".to_string()); }
    if !valid_slug(&input.slug) { return Err("Use a safe page slug with lowercase letters, numbers, and hyphens only.".to_string()); }
    if input.title.trim().is_empty() || input.title.len() > 200 { return Err("Add a valid page title before publishing.".to_string()); }
    if input.page_json.len() > MAX_RECIPE_JSON_BYTES { return Err("The page source is too large to publish.".to_string()); }
    if input.images.len() > 24 { return Err("A page may publish at most 24 local images at once.".to_string()); }
    if input.occupied_routes.iter().any(|route| !valid_slug(route)) { return Err("The route collision list contains an invalid value.".to_string()); }

    let target_path = page_path(&input.slug);
    if !allowed_publication_path(&target_path) { return Err("The generated page source path is not allowed.".to_string()); }
    let mut page: Value = serde_json::from_str(&input.page_json).map_err(|_| "The page source is not valid JSON.".to_string())?;
    let page_type = page.get("pageType").and_then(Value::as_str).unwrap_or_default();
    if (page_type == "home") != (input.slug == "home") { return Err("Homepage identity must remain home.".to_string()); }
    if page.get("slug").and_then(Value::as_str) != Some(input.slug.as_str())
        || page.get("title").and_then(Value::as_str) != Some(input.title.as_str())
    {
        return Err("The reviewed page identity does not match the active draft.".to_string());
    }

    let mut expectations = BTreeMap::<String, Option<String>>::new();
    let existing_page;
    let operation;
    if let Some(source) = &input.source {
        validate_page_source_identity(source)?;
        if source.slug != input.slug || source.path != target_path {
            return Err("Published page routes cannot be renamed yet. Create a new page to use a different slug.".to_string());
        }
        let current = snapshot_blob(snapshot, &source.path).ok_or_else(|| "This page was removed from GitHub after the draft was created.".to_string())?;
        if current.sha != source.blob_sha { return Err("This page changed in GitHub after the draft was created. Reload it or keep the draft as a copy.".to_string()); }
        let value = repository_json_value(state, token, current).await?;
        validate_repository_page(&value, &source.slug)?;
        existing_page = Some(value);
        expectations.insert(source.path.clone(), Some(source.blob_sha.clone()));
        operation = "update".to_string();
    } else {
        if snapshot_blob(snapshot, &target_path).is_some() { return Err("A published page with this slug already exists.".to_string()); }
        if input.slug != "home" && (RESERVED_PAGE_ROUTES.contains(&input.slug.as_str()) || input.occupied_routes.iter().any(|route| route == &input.slug)) {
            return Err("This page slug is reserved by an existing website route.".to_string());
        }
        if snapshot.entries.keys().any(|path| recipe_slug_from_path(path) == Some(input.slug.as_str())) {
            return Err("This page slug is already used by a recipe.".to_string());
        }
        let (aliases, _) = read_aliases(state, token, snapshot).await?;
        if aliases.contains_key(&input.slug) { return Err("This page slug is reserved by a recipe alias.".to_string()); }
        if let Some(categories) = snapshot_blob(snapshot, "src/content/categories.json") {
            let value = repository_json_value(state, token, categories).await?;
            if repository_route_uses_slug(&value, &input.slug) { return Err("This page slug is already used by a category.".to_string()); }
        }
        existing_page = None;
        expectations.insert(target_path.clone(), None);
        operation = "create".to_string();
    }

    let mut replacements = HashMap::new();
    let mut page_images = Vec::new();
    for image in &input.images {
        if replacements.contains_key(&image.block_id) { return Err("A page image block was submitted more than once.".to_string()); }
        let (path, file) = page_image_file(image, &input.slug)?;
        replacements.insert(image.block_id.clone(), path);
        page_images.push(file);
    }
    let mut seen = HashSet::new();
    let blocks = page.get_mut("layout").and_then(Value::as_object_mut).and_then(|layout| layout.get_mut("blocks")).and_then(Value::as_array_mut).ok_or_else(|| "The page layout is required.".to_string())?;
    for block in blocks { rewrite_page_image_blocks(block, &replacements, &mut seen)?; }
    if seen.len() != replacements.len() { return Err("A selected page image no longer has a matching image block.".to_string()); }
    validate_repository_page(&page, &input.slug)?;

    let page_file = json_file(target_path.clone(), &page)?;
    let page_json = String::from_utf8(page_file.bytes.clone()).map_err(|_| "The page source is not valid UTF-8.".to_string())?;
    let mut changes = vec![PublicationChange {
        operation: if input.source.is_some() { ChangeOperation::Modify } else { ChangeOperation::Add },
        path: target_path.clone(),
        file: Some(page_file),
    }];
    for file in page_images {
        let current = snapshot_blob(snapshot, &file.path).map(|entry| entry.sha.clone());
        if current.is_some() && !existing_page.as_ref().is_some_and(|value| value_contains_exact_string(value, &file.path)) {
            return Err("A generated page image path already belongs to another repository asset.".to_string());
        }
        expectations.insert(file.path.clone(), current.clone());
        changes.push(PublicationChange {
            operation: if current.is_some() { ChangeOperation::Modify } else { ChangeOperation::Add },
            path: file.path.clone(),
            file: Some(file),
        });
    }
    Ok(PendingPublishPlan {
        id: Uuid::new_v4().to_string(),
        source_draft_id: input.source_draft_id,
        recipe_title: input.title,
        recipe_slug: input.slug.clone(),
        base_commit_sha: snapshot.commit_sha.clone(),
        operation,
        changes,
        expectations: expectations.into_iter().map(|(path, sha)| PathExpectation { path, sha }).collect(),
        image_path: None,
        recipe_path: Some(target_path),
        recipe_json: Some(page_json),
        commit_message: if input.source.is_some() { format!("cms: update page {}", input.slug) } else { format!("cms: add page {}", input.slug) },
        created_at: now_seconds(),
    })
}

async fn build_publication_plan(
    state: &GithubState,
    token: &str,
    input: PreparePublishInput,
    snapshot: &RepositorySnapshot,
) -> Result<PendingPublishPlan, String> {
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

    let target_path = recipe_path(&input.slug);
    if !allowed_publication_path(&target_path) {
        return Err("The generated recipe source path is not allowed.".to_string());
    }
    let mut expectations = BTreeMap::<String, Option<String>>::new();
    let mut changes = Vec::new();
    let mut existing_recipe = None;
    let operation;
    if let Some(source) = &input.source {
        validate_source_identity(source)?;
        let current = snapshot_blob(snapshot, &source.path).ok_or_else(|| {
            "This recipe was removed from GitHub after the draft was created.".to_string()
        })?;
        if current.sha != source.blob_sha {
            return Err("This recipe changed in GitHub after your draft was created. Reload the published version or keep the draft as a copy.".to_string());
        }
        existing_recipe = Some(repository_json_value(state, token, current).await?);
        validate_repository_recipe(existing_recipe.as_ref().expect("recipe set"), &source.slug)?;
        expectations.insert(source.path.clone(), Some(source.blob_sha.clone()));
        if target_path != source.path {
            if snapshot_blob(snapshot, &target_path).is_some() {
                return Err("A published recipe with the new slug already exists.".to_string());
            }
            expectations.insert(target_path.clone(), None);
        }
        operation = "update".to_string();
    } else {
        if snapshot_blob(snapshot, &target_path).is_some() {
            return Err("A published recipe with this slug already exists.".to_string());
        }
        let (aliases, _) = read_aliases(state, token, snapshot).await?;
        if aliases.contains_key(&input.slug) {
            return Err("This slug is reserved by an existing recipe alias.".to_string());
        }
        expectations.insert(target_path.clone(), None);
        operation = "create".to_string();
    }

    let existing_image_path = existing_recipe
        .as_ref()
        .and_then(Value::as_object)
        .and_then(|recipe| string_field(recipe, "image"))
        .map(ToOwned::to_owned);
    let (image_path, replacement_image) = match input.image_action {
        ImageAction::Retain => {
            if input.source.is_none() || input.image.is_some() {
                return Err(
                    "Retaining an image is valid only for an existing published recipe."
                        .to_string(),
                );
            }
            (existing_image_path.clone(), None)
        }
        ImageAction::Replace => {
            let image = input
                .image
                .as_ref()
                .ok_or_else(|| "Select the replacement image on this device.".to_string())?;
            let (path, file) = image_file(image, &input.slug)?;
            (Some(path), Some(file))
        }
        ImageAction::Remove => {
            if input.image.is_some() {
                return Err("Unexpected image bytes were provided for image removal.".to_string());
            }
            (None, None)
        }
    };

    let recipe =
        parse_and_validate_recipe_json(&input, image_path.as_deref(), existing_recipe.as_ref())?;
    let recipe_file = json_file(target_path.clone(), &recipe)?;
    let recipe_json = String::from_utf8(recipe_file.bytes.clone())
        .map_err(|_| "The recipe source is not valid UTF-8.".to_string())?;
    let recipe_operation = if input
        .source
        .as_ref()
        .is_some_and(|source| source.path == target_path)
    {
        ChangeOperation::Modify
    } else {
        ChangeOperation::Add
    };
    changes.push(PublicationChange {
        operation: recipe_operation,
        path: target_path.clone(),
        file: Some(recipe_file),
    });

    if let Some(source) = &input.source {
        if source.path != target_path {
            changes.push(PublicationChange {
                operation: ChangeOperation::Delete,
                path: source.path.clone(),
                file: None,
            });
            let (mut aliases, alias_sha) = read_aliases(state, token, snapshot).await?;
            if aliases.contains_key(&input.slug) {
                return Err("The new slug is already reserved as a recipe alias.".to_string());
            }
            aliases.values_mut().for_each(|target| {
                if target == &source.slug {
                    *target = input.slug.clone();
                }
            });
            aliases.insert(source.slug.clone(), input.slug.clone());
            let alias_path = "src/content/aliases.json".to_string();
            expectations.insert(alias_path.clone(), alias_sha.clone());
            let alias_value = serde_json::to_value(aliases)
                .map_err(|_| "Recipe aliases could not be serialized.".to_string())?;
            changes.push(PublicationChange {
                operation: if alias_sha.is_some() {
                    ChangeOperation::Modify
                } else {
                    ChangeOperation::Add
                },
                path: alias_path.clone(),
                file: Some(json_file(alias_path, &alias_value)?),
            });
        }
    }

    if let Some(file) = replacement_image {
        let current = snapshot_blob(snapshot, &file.path).map(|entry| entry.sha.clone());
        let owned_existing_image = existing_image_path.as_deref() == Some(file.path.as_str());
        if current.is_some() && !owned_existing_image {
            return Err(
                "The replacement image path already belongs to another repository asset."
                    .to_string(),
            );
        }
        expectations.insert(file.path.clone(), current.clone());
        changes.push(PublicationChange {
            operation: if current.is_some() {
                ChangeOperation::Modify
            } else {
                ChangeOperation::Add
            },
            path: file.path.clone(),
            file: Some(file),
        });
    }

    let commit_message = if input.source.is_none() {
        format!("cms: add recipe {}", input.slug)
    } else if input
        .source
        .as_ref()
        .is_some_and(|source| source.slug != input.slug)
    {
        format!(
            "cms: rename recipe {} to {}",
            input.source.as_ref().expect("source set").slug,
            input.slug
        )
    } else {
        format!("cms: update recipe {}", input.slug)
    };
    Ok(PendingPublishPlan {
        id: Uuid::new_v4().to_string(),
        source_draft_id: input.source_draft_id,
        recipe_title: input.title,
        recipe_slug: input.slug,
        base_commit_sha: snapshot.commit_sha.clone(),
        operation,
        changes,
        expectations: expectations
            .into_iter()
            .map(|(path, sha)| PathExpectation { path, sha })
            .collect(),
        image_path,
        recipe_path: Some(target_path),
        recipe_json: Some(recipe_json),
        commit_message,
        created_at: now_seconds(),
    })
}

fn parse_and_validate_recipe_json(
    input: &PreparePublishInput,
    image_path: Option<&str>,
    existing: Option<&Value>,
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
    if recipe
        .get("imageAlt")
        .is_some_and(|value| !value.is_null() && value.as_str().is_none_or(|text| text.len() > 500))
    {
        return Err("Image alt text must be at most 500 characters.".to_string());
    }
    let layout = recipe
        .get("layout")
        .and_then(Value::as_object)
        .ok_or_else(|| "The recipe layout is required.".to_string())?;
    if layout.len() != 2
        || layout.get("modelVersion").and_then(Value::as_u64) != Some(1)
        || !layout.get("blocks").is_some_and(Value::is_array)
    {
        return Err(
            "The recipe layout must use model version 1 and contain only blocks.".to_string(),
        );
    }
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let stable_id = existing
        .and_then(Value::as_object)
        .and_then(|source| string_field(source, "id"))
        .filter(|value| valid_slug(value))
        .unwrap_or(&input.slug)
        .to_string();
    recipe.insert("id".to_string(), Value::String(stable_id));
    recipe.insert("name".to_string(), Value::String(input.title.clone()));
    recipe.insert("status".to_string(), Value::String("published".to_string()));
    recipe.insert("preparation".to_string(), Value::Array(steps));
    recipe.insert(
        "image".to_string(),
        image_path.map_or(Value::Null, |path| Value::String(path.to_string())),
    );
    let created_at = existing
        .and_then(Value::as_object)
        .and_then(|source| source.get("createdAt"))
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or_else(|| Value::String(now.clone()));
    recipe.insert("createdAt".to_string(), created_at);
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
    let is_site = plan.recipe_slug == "site-management";
    let is_page = plan.commit_message.contains(" page ");
    let mut checks = vec![
        if is_site {
            "Site configuration valid".to_string()
        } else if is_page {
            "Page valid".to_string()
        } else {
            "Recipe valid".to_string()
        },
        "Affected repository paths verified".to_string(),
        "GitHub connected".to_string(),
    ];
    if plan.operation == "delete" {
        checks.push("Deletion dependencies checked".to_string());
    } else if is_page && plan.changes.iter().any(|change| change.path.starts_with("assets/images/pages/")) {
        checks.push("Page images reviewed".to_string());
    } else if plan.image_path.is_some() {
        checks.push("Recipe image reviewed".to_string());
    }
    let route_changes = plan.changes.iter().filter(|change| {
        recipe_slug_from_path(&change.path).is_some() || page_slug_from_path(&change.path).is_some()
    }).map(|change| format!("{:?}: {}", change.operation, change.path)).collect();
    let dependency_impact = if plan.operation == "delete" {
        vec!["Structured dependencies were checked before this review.".to_string()]
    } else if is_site {
        vec!["Global configuration is rebuilt with all generated routes.".to_string()]
    } else {
        vec!["Generated indexes and routes will be rebuilt.".to_string()]
    };
    PublishReview {
        plan_id: plan.id.clone(),
        recipe_title: plan.recipe_title.clone(),
        recipe_slug: plan.recipe_slug.clone(),
        repository: REPOSITORY_FULL_NAME.to_string(),
        branch: branch.to_string(),
        base_commit_sha: plan.base_commit_sha.clone(),
        operation: plan.operation.clone(),
        file_changes: plan
            .changes
            .iter()
            .map(|change| PublicationFileChange {
                operation: change.operation,
                path: change.path.clone(),
            })
            .collect(),
        checks,
        route_changes,
        dependency_impact,
        global_impact_count: if is_site { plan.changes.len() } else { 1 },
        image_status: if plan.image_path.is_some() { "Validated or retained" } else { "No local image required" }.to_string(),
        conflict_status: "Base commit and source blobs verified".to_string(),
    }
}

fn allowed_recipe_image_path(path: &str) -> bool {
    let Some(file) = path.strip_prefix("assets/images/recipes/") else {
        return false;
    };
    [".jpg", ".png", ".webp"].iter().any(|extension| {
        file.strip_suffix(extension)
            .is_some_and(|slug| valid_slug(slug) && !slug.contains('.'))
    })
}

fn allowed_page_image_path(path: &str) -> bool {
    let Some(file) = path.strip_prefix("assets/images/pages/") else { return false; };
    [".jpg", ".png", ".webp"].iter().any(|extension| {
        file.strip_suffix(extension).is_some_and(|stem| {
            !stem.is_empty()
                && stem.len() <= 205
                && stem.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
                && !stem.starts_with('-')
                && !stem.ends_with('-')
        })
    })
}

fn object_has_only(value: &Map<String, Value>, allowed: &[&str]) -> bool {
    value.keys().all(|key| allowed.contains(&key.as_str()))
}

fn valid_hex_color(value: &str) -> bool {
    matches!(value.len(), 7 | 9)
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_navigation_items(value: Option<&Value>, depth: usize, ids: &mut HashSet<String>) -> Result<(), String> {
    let items = value.and_then(Value::as_array).ok_or_else(|| "Navigation items must be an array.".to_string())?;
    if depth > 2 && !items.is_empty() { return Err("Navigation submenus may be at most two levels deep.".to_string()); }
    for item in items {
        let item = item.as_object().ok_or_else(|| "Navigation items must be objects.".to_string())?;
        if !object_has_only(item, &["id", "label", "type", "target", "children"]) {
            return Err("A navigation item contains unsupported fields.".to_string());
        }
        let id = string_field(item, "id").filter(|id| valid_block_id(id)).ok_or_else(|| "A navigation item identifier is invalid.".to_string())?;
        if !ids.insert(id.to_string()) { return Err("Navigation item identifiers must be unique.".to_string()); }
        if string_field(item, "label").is_none_or(|label| label.trim().is_empty() || label.len() > 80) {
            return Err("A navigation label is invalid.".to_string());
        }
        let kind = string_field(item, "type").ok_or_else(|| "A navigation item type is required.".to_string())?;
        if !matches!(kind, "home" | "page" | "recipe" | "category" | "system" | "external" | "group") {
            return Err("A navigation item type is invalid.".to_string());
        }
        let target = string_field(item, "target").unwrap_or_default();
        if kind == "external" && !(target.starts_with("https://") || target.starts_with("http://")) {
            return Err("External navigation targets must use HTTP or HTTPS.".to_string());
        }
        if kind == "group" && !target.is_empty() { return Err("Navigation groups cannot have a target.".to_string()); }
        validate_navigation_items(item.get("children"), depth + 1, ids)?;
    }
    Ok(())
}

fn validate_site_source_value(path: &str, value: &Value) -> Result<(), String> {
    if !allowed_site_management_path(path) || value_contains_unsafe_string(value) {
        return Err(format!("{path} contains an unsafe or unsupported value."));
    }
    if let Some(slug) = recipe_slug_from_path(path) { return validate_repository_recipe(value, slug); }
    if let Some(slug) = page_slug_from_path(path) { return validate_repository_page(value, slug); }
    if path == "src/content/categories.json" {
        let categories = value.as_array().filter(|items| !items.is_empty()).ok_or_else(|| "Categories must be a non-empty array.".to_string())?;
        let mut ids = HashSet::new();
        let mut slugs = HashSet::new();
        for category in categories {
            let category = category.as_object().ok_or_else(|| "Categories must be objects.".to_string())?;
            if !object_has_only(category, &["id", "slug", "title", "name", "description", "status", "image", "icon", "metadata"]) {
                return Err("A category contains unsupported fields.".to_string());
            }
            let id = string_field(category, "id").filter(|id| valid_block_id(id)).ok_or_else(|| "A category identifier is invalid.".to_string())?;
            let slug = string_field(category, "slug").filter(|slug| valid_slug(slug)).ok_or_else(|| "A category slug is invalid.".to_string())?;
            if !ids.insert(id) || !slugs.insert(slug) { return Err("Category identifiers and slugs must be unique.".to_string()); }
            if string_field(category, "title").is_none_or(|title| title.trim().is_empty()) { return Err("A category title is required.".to_string()); }
        }
        return Ok(());
    }
    if path == "src/data/tag-groups.json" {
        let groups = value.as_object().ok_or_else(|| "Tag groups must be an object.".to_string())?;
        for (id, group) in groups {
            if !valid_block_id(id) { return Err("A tag group identifier is invalid.".to_string()); }
            let group = group.as_object().ok_or_else(|| "Tag groups must be objects.".to_string())?;
            if !object_has_only(group, &["label", "options"]) || string_field(group, "label").is_none_or(|label| label.trim().is_empty()) {
                return Err("A tag group is invalid.".to_string());
            }
            let options = group.get("options").and_then(Value::as_array).ok_or_else(|| "Tag options must be an array.".to_string())?;
            if options.iter().any(|item| item.as_str().is_none_or(|text| text.trim().is_empty())) { return Err("Tag options must contain non-empty text.".to_string()); }
        }
        return Ok(());
    }
    let object = value.as_object().ok_or_else(|| format!("{path} must be an object."))?;
    if object.get("modelVersion").and_then(Value::as_u64) != Some(1) { return Err(format!("{path} must use modelVersion 1.")); }
    match path {
        "src/content/site/templates.json" => {
            if !object_has_only(object, &["modelVersion", "templates"]) || object.get("templates").and_then(Value::as_array).is_none_or(|items| items.is_empty()) {
                return Err("Templates must contain at least one structured template.".to_string());
            }
        }
        "src/content/site/global-blocks.json" => {
            if !object_has_only(object, &["modelVersion", "blocks"]) || object.get("blocks").and_then(Value::as_array).is_none() {
                return Err("Global blocks must contain a blocks array.".to_string());
            }
        }
        "src/content/site/navigation.json" => {
            if !object_has_only(object, &["modelVersion", "header", "footer"]) { return Err("Navigation contains unsupported fields.".to_string()); }
            let header = object.get("header").and_then(Value::as_object).ok_or_else(|| "Navigation requires a header.".to_string())?;
            let footer = object.get("footer").and_then(Value::as_object).ok_or_else(|| "Navigation requires a footer.".to_string())?;
            if string_field(header, "logoHref") != Some("home") { return Err("The site logo must remain linked to Home.".to_string()); }
            let mut ids = HashSet::new();
            validate_navigation_items(header.get("primaryItems"), 1, &mut ids)?;
            validate_navigation_items(header.get("menuItems"), 1, &mut ids)?;
            validate_navigation_items(footer.get("links"), 1, &mut ids)?;
            validate_navigation_items(footer.get("socialLinks"), 1, &mut ids)?;
        }
        "src/content/site/settings.json" => {
            if !object_has_only(object, &["modelVersion", "siteTitle", "siteDescription", "language", "locale", "defaultSocialImage", "defaultTemplates"])
                || string_field(object, "language") != Some("ro") || string_field(object, "locale") != Some("ro_RO") {
                return Err("Site settings contain unsupported fields or locale values.".to_string());
            }
        }
        "src/content/site/theme.json" => {
            if !object_has_only(object, &["modelVersion", "colors", "typography", "layout", "shape", "cards", "buttons"]) { return Err("Theme contains unsupported fields.".to_string()); }
            let colors = object.get("colors").and_then(Value::as_object).ok_or_else(|| "Theme colors are required.".to_string())?;
            for name in ["primary", "accent", "background", "surface", "text", "mutedText", "border"] {
                if string_field(colors, name).is_none_or(|color| !valid_hex_color(color)) { return Err(format!("Theme color {name} is invalid.")); }
            }
        }
        _ => return Err("The site source path is not approved.".to_string()),
    }
    Ok(())
}

fn allowed_site_management_path(path: &str) -> bool {
    SITE_SOURCE_PATHS.contains(&path)
        || recipe_slug_from_path(path).is_some()
        || page_slug_from_path(path).is_some()
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
    if let Some(file) = path.strip_prefix("src/content/pages/") {
        return file
            .strip_suffix(".json")
            .is_some_and(|slug| valid_slug(slug) && !slug.contains('.'));
    }
    path == "src/content/aliases.json"
        || SITE_SOURCE_PATHS.contains(&path)
        || allowed_recipe_image_path(path)
        || allowed_page_image_path(path)
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

fn valid_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
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

    #[test]
    fn github_client_id_is_available_without_build_environment() {
        assert!(GithubState::new(None).unwrap().client_id.is_some());
    }

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
                "imageAlt": "Paste Carbonara",
                "sourceUrl": null,
                "createdAt": null,
                "updatedAt": null,
                "status": "draft",
                "closing": "Pofta buna!",
                "extras": [],
                "ratingSummary": null,
                "keywords": ["paste", "carbonara"],
                "layout": {
                    "modelVersion": 1,
                    "blocks": []
                }
            }))
            .unwrap(),
            image_action: if image.is_some() {
                ImageAction::Replace
            } else {
                ImageAction::Remove
            },
            image,
            source: None,
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
            access_token: "not-a-real-access-token".to_string(),
            refresh_token: "not-a-real-refresh-token".to_string(),
            expires_at: 1_000,
            refresh_token_expires_at: 10_000,
        };
        assert!(!token_needs_refresh(&bundle, 699));
        assert!(token_needs_refresh(&bundle, 700));
    }

    #[test]
    fn device_tokens_require_rotating_refresh_credentials() {
        let response = OAuthTokenResponse {
            access_token: Some("not-a-real-access-token".to_string()),
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
            access_token: "not-a-real-access-token".to_string(),
            refresh_token: "not-a-real-refresh-token".to_string(),
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
        assert!(allowed_publication_path("src/content/pages/despre-noi.json"));
        assert!(allowed_publication_path("assets/images/pages/despre-noi-page-image.png"));
        assert!(allowed_publication_path("src/content/aliases.json"));
        for path in SITE_SOURCE_PATHS {
            assert!(allowed_publication_path(path));
            assert!(allowed_site_management_path(path));
        }
        assert!(!allowed_publication_path(
            "src/content/recipes/../package.json"
        ));
        assert!(!allowed_publication_path(".github/workflows/deploy.yml"));
        assert!(!allowed_publication_path("src/content/recipes/%2e%2e.json"));
        assert!(!allowed_publication_path("src/content/pages/../tauri.conf.json"));
        assert!(!allowed_site_management_path("package.json"));
        assert!(!allowed_site_management_path(".github/workflows/deploy.yml"));
    }

    #[test]
    fn site_theme_rejects_css_expressions() {
        let theme = json!({
            "modelVersion": 1,
            "colors": {
                "primary": "#ff8a5b", "accent": "#62d6a8", "background": "#0f1117",
                "surface": "#181d29", "text": "#fff3e8", "mutedText": "#d4bba8", "border": "#ffd6ba2e"
            },
            "typography": {}, "layout": {}, "shape": {}, "cards": {}, "buttons": {}
        });
        assert!(validate_site_source_value("src/content/site/theme.json", &theme).is_ok());
        let mut unsafe_theme = theme;
        unsafe_theme["colors"]["primary"] = json!("url(javascript:alert(1))");
        assert!(validate_site_source_value("src/content/site/theme.json", &unsafe_theme).is_err());
    }

    #[test]
    fn structured_pages_enforce_safe_layout_and_homepage_identity() {
        let page = json!({
            "id": "home",
            "pageType": "home",
            "title": "Arta Gatitului",
            "slug": "home",
            "description": "Retete testate.",
            "socialImage": null,
            "status": "published",
            "layout": { "modelVersion": 1, "blocks": [{
                "id": "home-main",
                "type": "section",
                "data": { "blocks": [{
                    "id": "home-title",
                    "type": "heading",
                    "data": { "text": "Arta Gatitului", "level": 1 }
                }] }
            }] }
        });
        assert!(validate_repository_page(&page, "home").is_ok());
        let mut unsafe_page = page.clone();
        unsafe_page["layout"]["blocks"][0]["data"]["blocks"][0]["data"]["text"] = json!("javascript:alert(1)");
        assert!(validate_repository_page(&unsafe_page, "home").is_err());
        assert!(build_page_delete_plan(&RepositorySnapshot { commit_sha: "a".repeat(40), tree_sha: "b".repeat(40), entries: HashMap::new() }, &PageDeleteAnalysis {
            path: page_path("home"), slug: "home".to_string(), id: "home".to_string(), title: "Arta Gatitului".to_string(), page_type: "home".to_string(), commit_sha: "a".repeat(40), blob_sha: "c".repeat(40), dependencies: vec![],
        }, "draft-home-test").is_err());
    }

    #[test]
    fn recipe_source_and_image_are_validated_without_generated_output() {
        let input = recipe_input(None);
        let source = parse_and_validate_recipe_json(&input, None, None).unwrap();
        assert_eq!(source["id"], "paste-carbonara");
        assert_eq!(source["status"], "published");
        assert!(source["image"].is_null());

        let image = PublishImageInput {
            bytes_base64: BASE64.encode(include_bytes!("../../../icon.png")),
            mime_type: "image/png".to_string(),
        };
        let input = recipe_input(Some(image));
        let (image_path, image_file) =
            image_file(input.image.as_ref().unwrap(), &input.slug).unwrap();
        assert_eq!(image_path, "assets/images/recipes/paste-carbonara.png");
        assert_eq!(image_file.path, image_path);
        let source = parse_and_validate_recipe_json(&input, Some(&image_path), None).unwrap();
        assert_eq!(source["image"], image_path);
    }

    #[test]
    fn branch_conflict_requires_a_new_review() {
        let plan = PendingPublishPlan {
            id: "plan".to_string(),
            source_draft_id: "draft-test-123".to_string(),
            recipe_title: "Paste Carbonara".to_string(),
            recipe_slug: "paste-carbonara".to_string(),
            base_commit_sha: "a".repeat(40),
            operation: "update".to_string(),
            changes: vec![],
            expectations: vec![],
            image_path: None,
            recipe_path: Some("src/content/recipes/paste-carbonara.json".to_string()),
            recipe_json: Some("{}\n".to_string()),
            commit_message: "cms: update recipe paste-carbonara".to_string(),
            created_at: now_seconds(),
        };
        assert_ne!(plan.base_commit_sha, "c".repeat(40));
        let update_body = json!({ "sha": "d".repeat(40), "force": false });
        assert_eq!(update_body["force"], false);
    }

    #[test]
    fn structured_recipe_references_are_detected_without_substring_matches() {
        let source_path = "src/content/recipes/paste-carbonara.json";
        assert!(value_references_recipe(
            &json!({ "featured": "paste-carbonara" }),
            "paste-carbonara",
            source_path,
        ));
        assert!(value_references_recipe(
            &json!(["/retete/paste-carbonara/"]),
            "paste-carbonara",
            source_path,
        ));
        assert!(value_references_recipe(
            &json!("https://danielbrindusa.github.io/ArtaGatitului/retete/paste-carbonara/"),
            "paste-carbonara",
            source_path,
        ));
        assert!(!value_references_recipe(
            &json!({ "description": "Try paste-carbonara tonight" }),
            "paste-carbonara",
            source_path,
        ));
    }

    #[test]
    fn publication_review_exposes_add_modify_and_delete_paths() {
        let plan = PendingPublishPlan {
            id: "plan".to_string(),
            source_draft_id: "draft-test-123".to_string(),
            recipe_title: "Paste Carbonara".to_string(),
            recipe_slug: "carbonara-clasica".to_string(),
            base_commit_sha: "a".repeat(40),
            operation: "update".to_string(),
            changes: vec![
                PublicationChange {
                    operation: ChangeOperation::Add,
                    path: "src/content/recipes/carbonara-clasica.json".to_string(),
                    file: None,
                },
                PublicationChange {
                    operation: ChangeOperation::Delete,
                    path: "src/content/recipes/paste-carbonara.json".to_string(),
                    file: None,
                },
                PublicationChange {
                    operation: ChangeOperation::Modify,
                    path: "src/content/aliases.json".to_string(),
                    file: None,
                },
            ],
            expectations: vec![],
            image_path: None,
            recipe_path: Some("src/content/recipes/carbonara-clasica.json".to_string()),
            recipe_json: Some("{}\n".to_string()),
            commit_message: "cms: rename recipe paste-carbonara to carbonara-clasica".to_string(),
            created_at: now_seconds(),
        };
        let review = review_from_plan(&plan, "main");
        assert_eq!(review.file_changes.len(), 3);
        assert!(matches!(
            review.file_changes[0].operation,
            ChangeOperation::Add
        ));
        assert!(matches!(
            review.file_changes[1].operation,
            ChangeOperation::Delete
        ));
        assert!(matches!(
            review.file_changes[2].operation,
            ChangeOperation::Modify
        ));
    }

    #[test]
    fn historical_recipe_migration_adds_current_steps_and_layout() {
        let legacy = json!({
            "id": "paste-carbonara",
            "slug": "paste-carbonara",
            "name": "Paste Carbonara",
            "category": "Paste",
            "ingredients": ["paste", "ou"],
            "preparation": ["Fierbe pastele"]
        });
        let migrated = normalize_historical_source(
            "src/content/recipes/paste-carbonara.json",
            legacy,
        )
        .unwrap();
        assert_eq!(migrated["steps"], json!(["Fierbe pastele"]));
        assert_eq!(migrated["layout"]["modelVersion"], 1);
        assert_eq!(migrated["status"], "published");
    }

    #[test]
    fn restore_identity_blocks_slug_reuse_but_allows_deleted_content() {
        let historical = json!({ "id": "original-carbonara" });
        let same = json!({ "id": "original-carbonara" });
        let replacement = json!({ "id": "different-recipe" });
        assert!(validate_restore_identity(&historical, &same).is_ok());
        assert!(validate_restore_identity(&historical, &replacement).is_err());
        assert!(restorable_source_path("src/content/recipes/paste-carbonara.json"));
        assert!(!restorable_source_path(".github/workflows/site.yml"));
    }

    #[test]
    fn historical_assets_must_exist_now_or_at_the_selected_commit() {
        let asset = "assets/images/recipes/paste-carbonara.webp";
        let value = json!({ "image": asset });
        let current = RepositorySnapshot {
            commit_sha: "a".repeat(40),
            tree_sha: "b".repeat(40),
            entries: HashMap::new(),
        };
        let mut historical = RepositorySnapshot {
            commit_sha: "c".repeat(40),
            tree_sha: "d".repeat(40),
            entries: HashMap::new(),
        };
        assert!(historical_asset_statuses(&value, &current, &historical).is_err());
        historical.entries.insert(asset.to_string(), GitTreeEntry {
            path: asset.to_string(),
            mode: "100644".to_string(),
            kind: "blob".to_string(),
            sha: "e".repeat(40),
        });
        assert_eq!(
            historical_asset_statuses(&value, &current, &historical).unwrap(),
            vec![format!("{asset}: will be restored")]
        );
    }

    #[test]
    fn restore_plan_is_a_new_content_commit_not_a_ref_reset() {
        let plan = PendingPublishPlan {
            id: "restore-plan".to_string(),
            source_draft_id: "draft-restore-test".to_string(),
            recipe_title: "Paste Carbonara".to_string(),
            recipe_slug: "paste-carbonara".to_string(),
            base_commit_sha: "a".repeat(40),
            operation: "restore".to_string(),
            changes: vec![PublicationChange {
                operation: ChangeOperation::Modify,
                path: recipe_path("paste-carbonara"),
                file: Some(json_file(recipe_path("paste-carbonara"), &json!({})).unwrap()),
            }],
            expectations: vec![],
            image_path: None,
            recipe_path: Some(recipe_path("paste-carbonara")),
            recipe_json: Some("{}\n".to_string()),
            commit_message: "cms: restore recipe paste-carbonara from aaaaaaaaaaaa".to_string(),
            created_at: now_seconds(),
        };
        assert_eq!(plan.operation, "restore");
        assert!(plan.commit_message.starts_with("cms: restore"));
        assert_eq!(plan.changes.len(), 1);
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
