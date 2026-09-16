from pathlib import Path

import fitz


ROOT = Path(r"E:\Projects\axcas")
OUT = ROOT / "output" / "pdf"
HORIZON_SOURCE = Path(r"C:\Users\asus\Downloads\Horizon_2040_OnePager (2).pdf")
SUMMIT_SOURCE = Path(r"C:\Users\asus\Downloads\Global_Summit_Event_Workflow.pdf")
HORIZON_OUTPUT = OUT / "Horizon_2040_OnePager_No_Tracks_Final.pdf"
SUMMIT_OUTPUT = OUT / "Global_Summit_Event_Workflow_Updated_Heading_Final.pdf"


def remove_horizon_tracks() -> None:
    doc = fitz.open(HORIZON_SOURCE)
    page = doc[0]

    # Remove only the complete tracks block, leaving every other item in place.
    tracks_rect = fitz.Rect(70.0, 223.0, 525.0, 358.0)
    page.add_redact_annot(tracks_rect, fill=(1, 1, 1))
    page.apply_redactions()

    doc.save(HORIZON_OUTPUT, garbage=4, deflate=True)
    doc.close()


def update_summit_heading() -> None:
    doc = fitz.open(SUMMIT_SOURCE)
    page = doc[0]

    subtitle_rect = fitz.Rect(70.0, 91.0, 525.0, 107.5)
    page.add_redact_annot(subtitle_rect, fill=(1, 1, 1))
    page.apply_redactions()

    heading = (
        "India's Largest Hackathon - Part of the Global Summit at "
        "RV College of Engineering"
    )
    result = page.insert_textbox(
        subtitle_rect,
        heading,
        fontname="Times-Italic",
        fontsize=11.04,
        color=(0, 0, 0),
        align=fitz.TEXT_ALIGN_CENTER,
        overlay=True,
    )
    if result < 0:
        raise RuntimeError(f"Summit heading did not fit: {result}")

    doc.save(SUMMIT_OUTPUT, garbage=4, deflate=True)
    doc.close()


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    remove_horizon_tracks()
    update_summit_heading()
    print(HORIZON_OUTPUT)
    print(SUMMIT_OUTPUT)
