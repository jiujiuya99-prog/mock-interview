const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

async function parsePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return (result && result.text) || '';
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return (result && result.value) || '';
}

function parseTxt(buffer) {
  return buffer.toString('utf-8');
}

async function parseResume(buffer, mimetype, originalName) {
  const ext = (originalName || '').split('.').pop().toLowerCase();
  let text = '';

  if (ext === 'pdf' || (mimetype && mimetype.includes('pdf'))) {
    text = await parsePdf(buffer);
  } else if (ext === 'docx' || (mimetype && mimetype.includes('officedocument'))) {
    text = await parseDocx(buffer);
  } else if (ext === 'txt' || (mimetype && mimetype.includes('text'))) {
    text = parseTxt(buffer);
  } else {
    throw new Error('不支持的文件格式，请使用 PDF、DOCX 或 TXT');
  }

  if (!text || !text.trim()) {
    throw new Error('未能从文件中解析出文字，可能是扫描版或加密 PDF，请改用文本粘贴');
  }

  return text.trim();
}

module.exports = { parseResume };
