//! Shared paper-size definitions for document generation.
//! "Long" is the Philippine long bond paper (8.5 × 13 in), not US Legal (8.5 × 14).

use crate::utils::pdf::PdfOptions;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::LazyLock;

/// Margins in inches.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Margins {
    pub top: f64,
    pub bottom: f64,
    pub left: f64,
    pub right: f64,
}

/// `{ size: 'A4' | 'Letter' | 'Long', orientation: 'portrait' | 'landscape', margins }`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaperSettings {
    pub size: String,
    pub orientation: String,
    pub margins: Margins,
}

/// `(key, widthIn, heightIn)`
pub const PAPER_DIMENSIONS: [(&str, f64, f64); 3] =
    [("A4", 8.27, 11.69), ("Letter", 8.5, 11.0), ("Long", 8.5, 13.0)];

/// `PAPER_DIMENSIONS[size]` → `(widthIn, heightIn)`.
pub fn paper_dimensions(size: &str) -> Option<(f64, f64)> {
    PAPER_DIMENSIONS.iter().find(|(k, _, _)| *k == size).map(|(_, w, h)| (*w, *h))
}

pub const DEFAULT_MARGINS: Margins = Margins { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 };

pub static DEFAULT_PAPER: LazyLock<PaperSettings> = LazyLock::new(|| PaperSettings {
    size: "A4".into(),
    orientation: "portrait".into(),
    margins: DEFAULT_MARGINS,
});

impl Default for PaperSettings {
    fn default() -> Self {
        DEFAULT_PAPER.clone()
    }
}

pub fn parse_paper_json(json: Option<&str>) -> PaperSettings {
    let json = match json {
        Some(s) if !s.is_empty() => s,
        _ => return DEFAULT_PAPER.clone(),
    };
    let parsed: Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(_) => return DEFAULT_PAPER.clone(),
    };
    // JSON `null` → `parsed.size` throws in JS → caught → default.
    if parsed.is_null() {
        return DEFAULT_PAPER.clone();
    }
    let size = match parsed.get("size").and_then(|v| v.as_str()) {
        Some(s) if paper_dimensions(s).is_some() => s.to_string(),
        _ => "A4".to_string(),
    };
    let m = parsed.get("margins").filter(|v| crate::ipc::truthy(v));
    let mv = |k: &str| clamp_margin(m.and_then(|m| m.get(k)));
    PaperSettings {
        size,
        orientation: if parsed.get("orientation").and_then(|v| v.as_str()) == Some("landscape") {
            "landscape".into()
        } else {
            "portrait".into()
        },
        margins: Margins { top: mv("top"), bottom: mv("bottom"), left: mv("left"), right: mv("right") },
    }
}

fn clamp_margin(v: Option<&Value>) -> f64 {
    let n = match v.and_then(|v| v.as_f64()) {
        Some(f) if f.is_finite() => f,
        _ => 1.0,
    };
    n.max(0.0).min(3.0)
}

fn oriented_dims(paper: &PaperSettings) -> (f64, f64) {
    let (w, h) = paper_dimensions(&paper.size).unwrap_or((8.27, 11.69));
    if paper.orientation == "landscape" {
        (h, w)
    } else {
        (w, h)
    }
}

/// CSS @page size value, e.g. "8.27in 11.69in" or "8.5in 13in"
pub fn page_size_css(paper: &PaperSettings) -> String {
    let (w, h) = oriented_dims(paper);
    format!("{w}in {h}in")
}

/// Replacement for Electron's `printToPdfPageSize` + the printToPDF call options:
/// the named size (portrait dimensions) with `landscape` per orientation,
/// backgrounds on, and Chromium's default margins (Electron passed none).
pub fn pdf_options(paper: &PaperSettings) -> PdfOptions {
    let (w, h) = paper_dimensions(&paper.size).unwrap_or((8.27, 11.69));
    PdfOptions {
        paper_width_in: w,
        paper_height_in: h,
        landscape: paper.orientation == "landscape",
        print_background: true,
        margins_in: None,
        prefer_css_page_size: false,
        header_template: None,
        footer_template: None,
    }
}
