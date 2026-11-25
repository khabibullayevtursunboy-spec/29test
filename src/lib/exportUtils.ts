import * as XLSX from 'xlsx';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { TestResultRow } from '../types';

export function formatDurationUz(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} soniya`;
  return `${mins} daq ${secs} son`;
}

export function formatDateTimeUz(iso: string | null | undefined): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') || iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function exportResultsToExcel(results: TestResultRow[], filePrefix = 'test_natijalari'): void {
  const rows = results.map((r, index) => ({
    'T/r': index + 1,
    'O‘quvchi ismi va familiyasi': `${r.first_name} ${r.last_name}`,
    'O‘quvchi kodi': r.student_code,
    'Sinfi': r.class_name,
    'Test nomi': r.test_title,
    'Fan': r.subject_name,
    'To‘g‘ri javoblar': r.correct_count,
    'Noto‘g‘ri javoblar': r.wrong_count,
    'Foiz (%)': Number(r.percentage.toFixed(1)),
    'Baho': r.grade,
    'Sarflangan vaqt': formatDurationUz(r.time_spent_seconds),
    'Test ishlangan sana': formatDateTimeUz(r.submitted_at),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 15 },
    { wch: 10 },
    { wch: 28 },
    { wch: 20 },
    { wch: 16 },
    { wch: 17 },
    { wch: 11 },
    { wch: 8 },
    { wch: 16 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Natijalar');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filePrefix}_${today}.xlsx`);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportResultsToWord(
  results: TestResultRow[],
  meta: {
    schoolName: string;
    subjectName: string;
    teacherName: string;
    className: string;
    testTitle: string;
  }
): Promise<void> {
  const totalCount = results.length;
  const avgPct =
    totalCount > 0
      ? (results.reduce((acc, r) => acc + r.percentage, 0) / totalCount).toFixed(1)
      : '0.0';
  const grade5 = results.filter((r) => r.grade === '5').length;
  const grade4 = results.filter((r) => r.grade === '4').length;
  const grade3 = results.filter((r) => r.grade === '3').length;
  const grade2 = results.filter((r) => r.grade === '2').length;

  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  };

  const headerLabels = ['№', 'O‘quvchi F.I.Sh', 'Sinf', 'To‘g‘ri', 'Noto‘g‘ri', 'Foiz', 'Baho', 'Sana'];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerLabels.map(
      (label) =>
        new TableCell({
          borders: cellBorder,
          shading: { fill: '0F172A', type: ShadingType.CLEAR, color: 'auto' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 80, after: 80 },
              children: [
                new TextRun({
                  text: label,
                  bold: true,
                  color: 'FFFFFF',
                  size: 20,
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        })
    ),
  });

  const dataRows = results.map((r, idx) => {
    const bg = idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
    const cells = [
      String(idx + 1),
      `${r.first_name} ${r.last_name}`,
      r.class_name,
      String(r.correct_count),
      String(r.wrong_count),
      `${r.percentage.toFixed(1)}%`,
      r.grade,
      formatDateTimeUz(r.submitted_at),
    ];

    return new TableRow({
      children: cells.map(
        (val, cIdx) =>
          new TableCell({
            borders: cellBorder,
            shading: { fill: bg, type: ShadingType.CLEAR, color: 'auto' },
            children: [
              new Paragraph({
                alignment: cIdx === 1 ? AlignmentType.LEFT : AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: [
                  new TextRun({
                    text: val,
                    size: 19,
                    bold: cIdx === 6,
                    color: '0F172A',
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          })
      ),
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: meta.schoolName.toUpperCase(),
                bold: true,
                size: 28,
                color: '0F172A',
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: 'O‘quvchilar test natijalari hisoboti',
                size: 24,
                color: '475569',
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Test nomi: ', bold: true, size: 22, font: 'Calibri' }),
              new TextRun({ text: meta.testTitle, size: 22, font: 'Calibri' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Fan nomi: ', bold: true, size: 22, font: 'Calibri' }),
              new TextRun({ text: meta.subjectName, size: 22, font: 'Calibri' }),
              new TextRun({ text: '    |    Sinf: ', bold: true, size: 22, font: 'Calibri' }),
              new TextRun({ text: meta.className, size: 22, font: 'Calibri' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 220 },
            children: [
              new TextRun({ text: 'O‘qituvchi: ', bold: true, size: 22, font: 'Calibri' }),
              new TextRun({ text: meta.teacherName, size: 22, font: 'Calibri' }),
              new TextRun({ text: '    |    Hisobot sanasi: ', bold: true, size: 22, font: 'Calibri' }),
              new TextRun({ text: formatDateTimeUz(new Date().toISOString()), size: 22, font: 'Calibri' }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          }),
          new Paragraph({
            spacing: { before: 280, after: 100 },
            children: [
              new TextRun({
                text: 'Umumiy statistika',
                bold: true,
                size: 24,
                color: '0F172A',
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `Jami qatnashgan o‘quvchilar: ${totalCount} nafar  |  O‘rtacha natija: ${avgPct}%`,
                size: 21,
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Baholar taqsimoti — "5": ${grade5} ta  |  "4": ${grade4} ta  |  "3": ${grade3} ta  |  "2": ${grade2} ta`,
                size: 21,
                font: 'Calibri',
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const today = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(blob, `hisobot_${today}.docx`);
}
