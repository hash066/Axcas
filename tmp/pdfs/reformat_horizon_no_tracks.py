from pathlib import Path

import fitz


SOURCE = Path(r"C:\Users\asus\Downloads\Horizon_2040_OnePager (2).pdf")
OUTPUT = Path(
    r"E:\Projects\axcas\output\pdf\Horizon_2040_OnePager_2026_No_Tracks_Reformatted.pdf"
)


def main() -> None:
    source = fitz.open(SOURCE)
    source_page = source[0]
    page_width = source_page.rect.width
    page_height = source_page.rect.height

    output = fitz.open()
    page = output.new_page(width=page_width, height=page_height)

    # Preserve the header except for the single summit line being updated.
    header_top_clip = fitz.Rect(0, 0, page_width, 70)
    page.show_pdf_page(
        header_top_clip,
        source,
        0,
        clip=header_top_clip,
        keep_proportion=False,
    )
    header_bottom_clip = fitz.Rect(0, 86, page_width, 223)
    page.show_pdf_page(
        header_bottom_clip,
        source,
        0,
        clip=header_bottom_clip,
        keep_proportion=False,
    )

    heading = "Part of Global Summit 2026 - RV College of Engineering"
    heading_width = fitz.get_text_length(
        heading,
        fontname="Times-Italic",
        fontsize=11.04,
    )
    page.insert_text(
        ((page_width - heading_width) / 2, 83.3),
        heading,
        fontname="Times-Italic",
        fontsize=11.04,
        color=(0, 0, 0),
        overlay=True,
    )

    # Skip the complete tracks block and move all remaining content upward.
    lower_clip = fitz.Rect(0, 360, page_width, page_height)
    lower_target = fitz.Rect(0, 223, page_width, page_height - 137)
    page.show_pdf_page(
        lower_target,
        source,
        0,
        clip=lower_clip,
        keep_proportion=False,
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT, garbage=4, deflate=True)
    output.close()
    source.close()
    print(OUTPUT)


if __name__ == "__main__":
    main()
