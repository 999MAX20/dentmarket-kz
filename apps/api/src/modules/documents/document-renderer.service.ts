import { Injectable } from "@nestjs/common";
import { Document as DocxDocument, Packer, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";

@Injectable()
export class DocumentRendererService {
  renderTemplate(template: string, data: Record<string, unknown>) {
    return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, path: string) => {
      const value = path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, data);
      if (value == null) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });
  }

  async render(format: "PDF" | "DOCX", title: string, template: string, data: Record<string, unknown>) {
    const text = this.renderTemplate(template, data);
    return format === "DOCX" ? this.docx(title, text) : this.pdf(title, text);
  }

  private async docx(title: string, text: string) {
    const document = new DocxDocument({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 32 })], spacing: { after: 360 } }),
          ...text.split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun({ text: line, size: 22 })], spacing: { after: 120 } })),
        ],
      }],
      creator: "B2B Marketplace",
      description: "Versioned marketplace transaction document",
    });
    return Buffer.from(await Packer.toBuffer(document));
  }

  private pdf(title: string, text: string) {
    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: title, Producer: "B2B Marketplace" } });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document.font(require.resolve("@fontsource/roboto/files/roboto-cyrillic-400-normal.woff"));
      document.fontSize(19).text(title, { align: "center" }).moveDown(1.5);
      document.fontSize(11).text(text, { align: "left", lineGap: 4 });
      document.end();
    });
  }
}
