import { fmtDate, reportToText, type Profile, type Report } from "@medilog/engine";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

// Turns the doctor's one-pager into an A4 PDF and opens the share sheet
// (email to the clinic, AirDrop, print, save to Files). Generated on the phone.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function hpiHtml(r: Report, p: Profile): string {
  const metrics = r.hpi.metrics.map((m) => `<div class="m"><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join("");
  const sections = r.hpi.sections
    .map((s) => `<section><h4>${esc(s.title)}</h4><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    body { font: 11pt -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #111; line-height: 1.4; }
    header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
    .k { font-size: 8pt; text-transform: uppercase; letter-spacing: .07em; color: #666; font-weight: 700; margin: 0; }
    .who { font-weight: 700; font-size: 13pt; margin: 2px 0 0; }
    .when { text-align: right; font-size: 9pt; color: #444; }
    .cc { font-weight: 600; font-size: 12pt; margin: 8px 0; }
    .cc b { background: #111; color: #fff; font-size: 8pt; padding: 1px 5px; border-radius: 3px; margin-right: 6px; }
    dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0 0 8px; }
    .m { background: #f2f2f2; border-radius: 4px; padding: 5px 7px; }
    dt { font-size: 7.5pt; text-transform: uppercase; color: #666; font-weight: 700; }
    dd { margin: 0; font-weight: 650; }
    h4 { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #0e6b63; margin: 10px 0 2px; }
    ul { margin: 0; padding-left: 16px; }
    footer { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8pt; color: #666; }
  </style></head><body>
    <header><div><p class="k">Patient-prepared history of presenting illness</p>
      <p class="who">${esc(p.name || "Patient")}${p.dob ? ` · DOB ${esc(p.dob)}` : ""}</p></div>
      <div class="when">${esc(r.data.range.label)}<br>${fmtDate(r.data.range.start)} – ${fmtDate(r.data.range.end)}</div></header>
    <p class="cc"><b>CC</b>${esc(r.hpi.chiefComplaint)}</p>
    <dl>${metrics}</dl>${sections}
    <footer>From ${r.data.logs} patient-entered logs, recorded at the time of symptoms with Medilog. Descriptive only: this tool makes no diagnosis and gives no treatment advice.</footer>
  </body></html>`;
}

export async function shareOnePagerPdf(r: Report, p: Profile) {
  if (Platform.OS === "web") return Share.share({ message: reportToText(r, p.name || undefined) });
  const { uri } = await Print.printToFileAsync({ html: hpiHtml(r, p) });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Send to your clinic" });
}

export function shareOnePagerText(r: Report, p: Profile) {
  return Share.share({ message: reportToText(r, p.name || undefined) });
}
