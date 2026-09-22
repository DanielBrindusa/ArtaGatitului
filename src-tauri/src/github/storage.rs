use keyring_core::{Entry, Error as KeyringError};

const CREDENTIAL_SERVICE: &str = "ro.danielbrindusa.artagatitului.github";
const CREDENTIAL_ACCOUNT: &str = "github-user-token";

pub trait SecretStore: Send + Sync {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, value: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

#[derive(Default)]
pub struct NativeSecretStore;

impl NativeSecretStore {
    fn entry() -> Result<Entry, String> {
        Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
            .map_err(|_| "Secure GitHub credential storage is unavailable.".to_string())
    }
}

impl SecretStore for NativeSecretStore {
    fn load(&self) -> Result<Option<String>, String> {
        match Self::entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(_) => Err("Secure GitHub credentials could not be read.".to_string()),
        }
    }

    fn save(&self, value: &str) -> Result<(), String> {
        Self::entry()?
            .set_password(value)
            .map_err(|_| "Secure GitHub credentials could not be saved.".to_string())
    }

    fn delete(&self) -> Result<(), String> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(_) => Err("Secure GitHub credentials could not be removed.".to_string()),
        }
    }
}

pub fn initialize_native_store() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let store = windows_native_keyring_store::Store::new()
            .map_err(|_| "Windows Credential Manager could not be initialized.".to_string())?;
        keyring_core::set_default_store(store);
        return Ok(());
    }

    #[cfg(target_os = "android")]
    {
        let store = android_native_keyring_store::Store::new().map_err(|_| {
            "Android Keystore credential storage could not be initialized.".to_string()
        })?;
        keyring_core::set_default_store(store);
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Secure GitHub credential storage is unsupported on this platform.".to_string())
}

#[cfg(test)]
pub struct MemorySecretStore {
    value: std::sync::Mutex<Option<String>>,
}

#[cfg(test)]
impl MemorySecretStore {
    pub fn empty() -> Self {
        Self {
            value: std::sync::Mutex::new(None),
        }
    }
}

#[cfg(test)]
impl SecretStore for MemorySecretStore {
    fn load(&self) -> Result<Option<String>, String> {
        Ok(self.value.lock().map_err(|_| "lock failed")?.clone())
    }

    fn save(&self, value: &str) -> Result<(), String> {
        *self.value.lock().map_err(|_| "lock failed")? = Some(value.to_string());
        Ok(())
    }

    fn delete(&self) -> Result<(), String> {
        *self.value.lock().map_err(|_| "lock failed")? = None;
        Ok(())
    }
}
