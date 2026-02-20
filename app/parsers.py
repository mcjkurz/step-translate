"""
Document parsers for extracting text passages from PDF, TXT, and DOCX files.
"""

import re
import uuid
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
from docx import Document as DocxDocument


@dataclass
class Passage:
    """A text passage extracted from a document."""
    id: str
    text: str
    page: int | None = None  # Page number (1-indexed), if applicable
    style: str = "paragraph"  # 'title', 'heading', 'author', 'paragraph'


def _split_into_paragraphs(text: str, min_length: int = 5) -> list[str]:
    """Split text into paragraphs, preserving meaningful content."""
    # Split on multiple newlines (paragraph breaks)
    paragraphs = re.split(r'\n\s*\n', text)
    
    # Clean and filter paragraphs
    result = []
    for p in paragraphs:
        # Normalize whitespace within paragraph
        cleaned = re.sub(r'\s+', ' ', p).strip()
        # Skip empty or very short paragraphs
        if cleaned and len(cleaned) >= min_length:
            result.append(cleaned)
    
    return result


def parse_txt(file_path: Path) -> list[Passage]:
    """Parse a TXT file into passages with basic formatting detection."""
    text = file_path.read_text(encoding='utf-8', errors='replace')
    paragraphs = _split_into_paragraphs(text)
    
    passages = []
    for i, p in enumerate(paragraphs):
        # Heuristic: first short paragraph might be title
        style = "paragraph"
        if i == 0 and len(p) < 100:
            style = "title"
        elif i == 1 and len(p) < 80 and passages and passages[0].style == "title":
            style = "author"
        
        passages.append(Passage(id=str(uuid.uuid4()), text=p, page=None, style=style))
    
    return passages


def parse_pdf(file_path: Path) -> list[Passage]:
    """Parse a PDF file into passages using PyMuPDF with formatting detection."""
    passages = []
    
    with fitz.open(file_path) as doc:
        # First pass: collect font size statistics to determine what's "normal"
        all_font_sizes = []
        for page in doc:
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if block.get("type") == 0:  # Text block
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            size = span.get("size", 12)
                            text = span.get("text", "").strip()
                            if text:
                                all_font_sizes.extend([size] * len(text))
        
        # Calculate normal font size (most common)
        if all_font_sizes:
            normal_size = max(set(all_font_sizes), key=all_font_sizes.count)
        else:
            normal_size = 12
        
        # Second pass: extract passages with style hints
        for page_num, page in enumerate(doc, start=1):
            blocks = page.get_text("dict")["blocks"]
            
            for block in blocks:
                if block.get("type") != 0:  # Skip non-text blocks
                    continue
                
                # Collect text and max font size for this block
                block_text_parts = []
                max_font_size = 0
                is_bold = False
                
                for line in block.get("lines", []):
                    line_text = ""
                    for span in line.get("spans", []):
                        text = span.get("text", "")
                        line_text += text
                        size = span.get("size", 12)
                        if size > max_font_size:
                            max_font_size = size
                        # Check for bold (flag bit 0x10 or 16)
                        flags = span.get("flags", 0)
                        if flags & 16:
                            is_bold = True
                    block_text_parts.append(line_text)
                
                # Join lines and clean up
                block_text = " ".join(block_text_parts)
                block_text = re.sub(r'\s+', ' ', block_text).strip()
                
                if not block_text or len(block_text) < 3:
                    continue
                
                # Determine style based on font size and other heuristics
                style = "paragraph"
                size_ratio = max_font_size / normal_size if normal_size > 0 else 1
                
                if size_ratio >= 1.5:
                    style = "title"
                elif size_ratio >= 1.2 or is_bold:
                    # Check if it's short (likely heading/author)
                    if len(block_text) < 100:
                        # First page, short text after title = likely author
                        if page_num == 1 and len(passages) >= 1 and passages[-1].style == "title":
                            style = "author"
                        else:
                            style = "heading"
                    else:
                        style = "paragraph"
                
                passages.append(
                    Passage(
                        id=str(uuid.uuid4()),
                        text=block_text,
                        page=page_num,
                        style=style
                    )
                )
    
    return passages


def parse_docx(file_path: Path) -> list[Passage]:
    """Parse a DOCX file into passages, preserving structure."""
    doc = DocxDocument(file_path)
    passages = []
    
    for para in doc.paragraphs:
        text = para.text.strip()
        # Skip empty paragraphs
        if not text:
            continue
        
        # Normalize whitespace within the paragraph
        cleaned = re.sub(r'\s+', ' ', text).strip()
        
        # Determine style based on Word's style names
        style_name = para.style.name if para.style else ""
        
        if style_name == "Title":
            style = "title"
        elif style_name.startswith("Heading"):
            style = "heading"
        elif style_name == "Subtitle" or (not passages and len(cleaned) < 80):
            style = "author" if not passages else "heading"
        else:
            style = "paragraph"
        
        # Include even short text if it's a heading
        if len(cleaned) > 5 or style in ("title", "heading", "author"):
            passages.append(
                Passage(id=str(uuid.uuid4()), text=cleaned, page=None, style=style)
            )
    
    return passages


def parse_document(file_path: Path, file_type: str) -> list[Passage]:
    """
    Parse a document based on its file type.
    
    Args:
        file_path: Path to the document file
        file_type: One of 'pdf', 'txt', 'docx'
    
    Returns:
        List of Passage objects
    """
    parsers = {
        'pdf': parse_pdf,
        'txt': parse_txt,
        'docx': parse_docx,
    }
    
    parser = parsers.get(file_type.lower())
    if not parser:
        raise ValueError(f"Unsupported file type: {file_type}")
    
    return parser(file_path)


def detect_file_type(filename: str, content_type: str | None = None) -> str | None:
    """
    Detect file type from filename extension or content type.
    
    Returns:
        File type string ('pdf', 'txt', 'docx') or None if unsupported
    """
    # Check extension first
    ext = Path(filename).suffix.lower()
    ext_map = {
        '.pdf': 'pdf',
        '.txt': 'txt',
        '.text': 'txt',
        '.docx': 'docx',
    }
    
    if ext in ext_map:
        return ext_map[ext]
    
    # Fall back to content type
    if content_type:
        content_map = {
            'application/pdf': 'pdf',
            'application/x-pdf': 'pdf',
            'text/plain': 'txt',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        }
        return content_map.get(content_type)
    
    return None
