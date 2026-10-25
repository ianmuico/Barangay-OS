//! HTML → PDF using the Edge / Chrome already installed on the machine
//! (replaces Electron's `webContents.printToPDF`). Every Windows PC ships Edge,
//! so the barangay office never has to install anything extra.
//!
//! Options mirror Electron's printToPDF: page size in inches, landscape,
//! backgrounds on, default ~0.4in margins unless overridden.

use anyhow::{anyhow, Context, Result};
use headless_chrome::types::PrintToPdfOptions;
use headless_chrome::{Browser, LaunchOptions};
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct PdfOptions {
    pub paper_width_in: f64,
    pub paper_height_in: f64,
    pub landscape: bool,
    pub print_background: bool,
    /// Top, bottom, left, right in inches. `None` → Chromium default (~0.4in).
    pub margins_in: Option<(f64, f64, f64, f64)>,
    /// Let CSS `@page { size }` override the paper size.
    pub prefer_css_page_size: bool,
    /// Electron's `displayHeaderFooter` templates (`pageNumber` / `totalPages`
    /// spans work). Either one being set turns header/footer on.
    pub header_template: Option<String>,
    pub footer_template: Option<String>,
}

impl Default for PdfOptions {
    /// A4 portrait, backgrounds on.
    fn default() -> Self {
        PdfOptions {
            paper_width_in: 8.27,
            paper_height_in: 11.69,
            landscape: false,
            print_background: true,
            margins_in: None,
            prefer_css_page_size: false,
            header_template: None,
            footer_template: None,
        }
    }
}

/// Locate Edge or Chrome. Edge first on Windows (always present there).
pub fn find_browser() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        for var in ["PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"] {
            if let Ok(base) = std::env::var(var) {
                let base = PathBuf::from(base);
                candidates.push(base.join(r"Microsoft\Edge\Application\msedge.exe"));
                candidates.push(base.join(r"Google\Chrome\Application\chrome.exe"));
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".into());
        candidates.push("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge".into());
        candidates.push("/Applications/Chromium.app/Contents/MacOS/Chromium".into());
        candidates.push("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser".into());
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        for name in ["microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"] {
            for dir in ["/usr/bin", "/usr/local/bin", "/snap/bin"] {
                candidates.push(PathBuf::from(dir).join(name));
            }
        }
    }
    candidates.into_iter().find(|p| p.exists()).or_else(|| headless_chrome::browser::default_executable().ok())
}

/// Render a complete HTML document to PDF bytes. Blocking — call from
/// `tokio::task::spawn_blocking` (or a sync IPC handler).
pub fn html_to_pdf(html: &str, opts: &PdfOptions) -> Result<Vec<u8>> {
    let browser_path = find_browser().ok_or_else(|| {
        anyhow!("PDF export needs Microsoft Edge or Google Chrome installed on this computer.")
    })?;

    // A temp file, not a data: URL — large documents with embedded base64
    // images exceed URL length limits.
    let dir = tempfile::tempdir().context("temp dir")?;
    let html_path = dir.path().join("document.html");
    std::fs::write(&html_path, html)?;
    let url = url::Url::from_file_path(&html_path).map_err(|_| anyhow!("bad temp path"))?;

    let browser = Browser::new(
        LaunchOptions::default_builder()
            .path(Some(browser_path))
            .headless(true)
            .sandbox(true)
            .idle_browser_timeout(Duration::from_secs(60))
            .args(vec![
                std::ffi::OsStr::new("--disable-gpu"),
                std::ffi::OsStr::new("--no-first-run"),
                std::ffi::OsStr::new("--disable-extensions"),
                std::ffi::OsStr::new("--allow-file-access-from-files"),
            ])
            .build()
            .map_err(|e| anyhow!("browser launch options: {e}"))?,
    )
    .map_err(|e| anyhow!("Could not start the PDF renderer (Edge/Chrome): {e}"))?;

    let tab = browser.new_tab().map_err(|e| anyhow!("{e}"))?;
    tab.navigate_to(url.as_str()).map_err(|e| anyhow!("{e}"))?;
    tab.wait_until_navigated().map_err(|e| anyhow!("{e}"))?;
    // Let web fonts and images settle (Electron's flow waited for did-finish-load).
    let _ = tab.evaluate(
        "Promise.all([document.fonts ? document.fonts.ready : null, ...Array.from(document.images).map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))]).then(() => true)",
        true,
    );

    let (mt, mb, ml, mr) = match opts.margins_in {
        Some(m) => (Some(m.0), Some(m.1), Some(m.2), Some(m.3)),
        None => (None, None, None, None),
    };
    let header_footer = opts.header_template.is_some() || opts.footer_template.is_some();
    let pdf = tab
        .print_to_pdf(Some(PrintToPdfOptions {
            landscape: Some(opts.landscape),
            display_header_footer: Some(header_footer),
            print_background: Some(opts.print_background),
            scale: None,
            paper_width: Some(opts.paper_width_in),
            paper_height: Some(opts.paper_height_in),
            margin_top: mt,
            margin_bottom: mb,
            margin_left: ml,
            margin_right: mr,
            page_ranges: None,
            ignore_invalid_page_ranges: None,
            header_template: header_footer.then(|| opts.header_template.clone().unwrap_or_else(|| "<span></span>".into())),
            footer_template: header_footer.then(|| opts.footer_template.clone().unwrap_or_else(|| "<span></span>".into())),
            prefer_css_page_size: Some(opts.prefer_css_page_size),
            transfer_mode: None,
            generate_document_outline: None,
            generate_tagged_pdf: None,
        }))
        .map_err(|e| anyhow!("PDF render failed: {e}"))?;
    Ok(pdf)
}

/// Async wrapper for use inside async handlers.
pub async fn html_to_pdf_async(html: String, opts: PdfOptions) -> Result<Vec<u8>> {
    tokio::task::spawn_blocking(move || html_to_pdf(&html, &opts)).await?
}
