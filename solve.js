// csv-reader-fast: a fast drop-in replacement for csv-reader 1.0.0.
//
// Same answers as csv-reader 1.0.0 for every input, less CPU. Single pass,
// left to right. Scanning is driven by the engine's native string search
// (indexOf / split / slice) instead of per-character loops; lines without
// a quote are split natively; quoted fields are found by searching for the
// next quote. Field values are slices of the source text, never built
// character by character.
//
// run({text, header}) -> {columns, rows, errors}
export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1;
  let line = 1; // 1-based line number of the line pos is on
  let rowIdx = 0; // index in rows of the next record to be added
  let isFirst = true;
  let unquotedRest = false; // set after an unterminated quote: rest is unquoted
  let qPos = -1; // next '"' at/after pos, or Infinity when none is left
  let pos = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1; // drop leading BOM

  function finishRecord(fields, recLine, recRow) {
    if (width === -1) {
      width = fields.length;
      if (header) {
        columns = fields;
      } else {
        rows.push(fields);
        rowIdx++;
      }
    } else if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
      rows.push(fields);
      rowIdx++;
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.slice(width) });
      fields.length = width;
      rows.push(fields);
      rowIdx++;
    } else {
      rows.push(fields);
      rowIdx++;
    }
    isFirst = false;
  }

  while (pos < n) {
    const ch0 = text.charCodeAt(pos);
    if (ch0 === 10) { pos++; line++; continue; } // empty line (LF)
    if (ch0 === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; continue; } // empty line (CRLF)
    const recLine = line;
    const recRow = header && isFirst ? null : rowIdx;
    const lf = text.indexOf('\n', pos);
    const lineEnd = lf === -1 ? n : lf;
    if (!unquotedRest && qPos < pos) {
      const q = text.indexOf('"', pos);
      qPos = q === -1 ? Infinity : q;
    }

    if (!unquotedRest && qPos < lineEnd) {
      // ---- careful path: this line holds a quote; parse one record ----
      const fields = [];
      let le = lineEnd; // index of the '\n' ending the current physical line (or n)
      let done = false;
      while (!done) {
        let prefix = '';
        let handled = false;
        if (pos < n && text.charCodeAt(pos) === 34 && !unquotedRest) {
          // quoted field
          let q = text.indexOf('"', pos + 1);
          let unterminated = q === -1;
          let val = '';
          if (!unterminated && text.charCodeAt(q + 1) === 34) {
            // doubled quotes: accumulate segments, each "" is one literal "
            let seg = pos + 1;
            let qq = q;
            for (;;) {
              val += text.slice(seg, qq) + '"';
              seg = qq + 2;
              qq = text.indexOf('"', seg);
              if (qq === -1) { unterminated = true; break; }
              if (text.charCodeAt(qq + 1) !== 34) { val += text.slice(seg, qq); q = qq; break; }
            }
          } else if (!unterminated) {
            val = text.slice(pos + 1, q);
          }
          if (unterminated) {
            errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
            unquotedRest = true;
            prefix = '"'; // opening quote becomes a literal character
            pos = pos + 1; // fall through: rest of the field reads as unquoted
          } else {
            // line breaks inside the quoted value: each LF counts once,
            // each lone CR counts once; CRLF / lone CR inside read as LF
            let breaks = 0;
            const ni = val.indexOf('\n');
            const ri = val.indexOf('\r');
            if (ni !== -1 || ri !== -1) {
              if (ni !== -1) { let i = ni; while (i !== -1) { breaks++; i = val.indexOf('\n', i + 1); } }
              if (ri !== -1) { let i = ri; while (i !== -1) { if (val.charCodeAt(i + 1) !== 10) breaks++; i = val.indexOf('\r', i + 1); } }
              line += breaks;
              if (ri !== -1) val = val.replace(/\r\n?/g, '\n');
            }
            // junk after the closing quote, up to the next comma / line break / EOF
            let j = q + 1;
            let junk = '';
            let endKind = 0; // 0 = comma (record continues), 1 = record ends
            let termNl = false;
            for (;;) {
              if (j >= n) { endKind = 1; termNl = false; pos = n; break; }
              const jc = text.charCodeAt(j);
              if (jc === 44) { endKind = 0; pos = j + 1; break; }
              if (jc === 10) { endKind = 1; termNl = true; pos = j + 1; break; }
              if (jc === 13) {
                if (j + 1 < n && text.charCodeAt(j + 1) === 10) { endKind = 1; termNl = true; pos = j + 2; break; }
                errors.push({ code: 'stray_cr', line: recLine, row: recRow });
                j++; // lone CR dropped; junk continues after it
                continue;
              }
              const cc = text.indexOf(',', j);
              const nn = text.indexOf('\n', j);
              let m;
              if (cc === -1) m = nn === -1 ? n : nn;
              else if (nn === -1) m = cc;
              else m = cc < nn ? cc : nn;
              let seg = text.slice(j, m);
              if (m < n && text.charCodeAt(m) === 10 && seg.charCodeAt(seg.length - 1) === 13) seg = seg.slice(0, -1); // CRLF
              if (seg.indexOf('\r') !== -1) {
                const parts = seg.split('\r');
                for (let k = 0; k < parts.length - 1; k++) errors.push({ code: 'stray_cr', line: recLine, row: recRow });
                seg = parts.join('');
              }
              junk += seg;
              j = m;
            }
            if (junk !== '') {
              errors.push({ code: 'quote_junk', line: recLine, row: recRow });
              val += junk;
            }
            fields.push(val);
            if (endKind === 1) {
              if (termNl) line++;
              done = true;
            } else if (breaks > 0) {
              le = text.indexOf('\n', pos); // field spanned lines; re-find this line's end
              if (le === -1) le = n;
            }
            handled = true;
          }
        }
        if (!handled) {
          // unquoted field (also used for the unterminated re-read, with prefix '"')
          const c = text.indexOf(',', pos);
          let end;
          let isComma;
          if (c !== -1 && c < le) { end = c; isComma = true; }
          else { end = le; isComma = false; }
          let val = prefix + text.slice(pos, end);
          if (val.indexOf('\r') !== -1) {
            if (!isComma && le < n && val.charCodeAt(val.length - 1) === 13) val = val.slice(0, -1); // CRLF
            if (val.indexOf('\r') !== -1) {
              const parts = val.split('\r');
              for (let k = 0; k < parts.length - 1; k++) errors.push({ code: 'stray_cr', line: recLine, row: recRow });
              val = parts.join('');
            }
          }
          fields.push(val);
          if (isComma) {
            pos = end + 1;
          } else {
            if (le < n) { pos = le + 1; line++; }
            else pos = n;
            done = true;
          }
        }
      }
      finishRecord(fields, recLine, recRow);
    } else {
      // ---- fast path: this line holds no quote, so it is one whole record ----
      let contentEnd = lineEnd;
      if (lf !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13) contentEnd = lineEnd - 1; // CRLF
      let s = text.slice(pos, contentEnd);
      if (s.indexOf('\r') !== -1) {
        const parts = s.split('\r');
        for (let k = 0; k < parts.length - 1; k++) errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        s = parts.join('');
      }
      finishRecord(s.split(','), recLine, recRow);
      if (lf !== -1) { pos = lf + 1; line++; }
      else pos = n;
    }
  }

  if (width === -1) columns = header ? [] : null; // no records at all
  return { columns, rows, errors };
}
