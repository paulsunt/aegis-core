
import { createRequire } from "module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export const PdfReadSchema = {
  path: "Path to the PDF file to read",
  pageRange: "(Optional) Range of pages to read (e.g. '1-3', '5')",
};

export class PdfSkill {
  constructor(private readonly rootDir: string) {}

  /**
   * Reads a PDF and returns its text content.
   */
  async read(args: { path: string; pageRange?: string }): Promise<string> {
    const { path: filePath, pageRange } = args;

    // Security check: ensure path is within allowed directory
    const resolvedPath = path.resolve(this.rootDir, filePath);
    
    // Debug logs kept for now as they are helpful
    console.log(`[PdfSkill] Reading: "${filePath}"`);
    console.log(`[PdfSkill] Root: "${this.rootDir}"`);
    console.log(`[PdfSkill] Resolved: "${resolvedPath}"`);

    if (!resolvedPath.startsWith(this.rootDir)) {
      console.error(`[PdfSkill] Access denied! Resolved path not in root.`);
      throw new Error(`Access denied: ${filePath} is outside allowed paths.`);
    }

    try {
      const buffer = await fs.readFile(resolvedPath);
      
      const options = pageRange ? {
        pagerender: (pageData: any) => {
           return pageData.getTextContent();
        }
      } : {};

      // pdf-parse 1.1.1 exports the function directly
      const data = await pdfParse(buffer, options);
      
      // Basic post-processing
      const text = data.text.trim();
      if (!text) {
        return "[PDF is empty or contains only images/scanned text without OCR layer]";
      }
      
      return `Page Count: ${data.numpages}\n\n${text}`;
    } catch (err: any) {
      console.error("[PdfSkill] Error details:", err);
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to parse PDF: ${err.message || "Unknown error"}`);
    }
  }
}
