import { AppError, type Track } from '../../core/src/index';
import { importFile, type PlaylistSource } from './import';

const columns = ['playlist', 'id', 'title', 'artists', 'album', 'duration', 'cover', 'isrc', 'identifiers'];
const spreadsheetFormula = /^(?:[\t\r\n]|\s*[=+\-@＝＋－＠])/u;

function readRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const finishField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === ',') {
      finishField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
      if (rows.length > 10001) throw new AppError('INVALID_CSV', '歌单最多支持 10000 首曲目');
    } else if (!closed && !field && char === '"') {
      quoted = true;
    } else if (!closed && char !== '"') {
      field += char;
    } else {
      throw new AppError('INVALID_CSV', 'CSV 引号格式无效');
    }
  }

  if (quoted) throw new AppError('INVALID_CSV', 'CSV 中有未闭合的引号');
  finishRow();
  return rows;
}

function jsonField(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function restoreCell(value: string): string {
  const rest = value.slice(1);
  return value.startsWith("'") && (rest.startsWith("'") || spreadsheetFormula.test(rest)) ? rest : value;
}

export function importCsv(text: string, fileName: string) {
  const [header = [], ...rows] = readRows(text.replace(/^\uFEFF/, ''));
  const names = header.map(value => value.trim().toLowerCase());
  const hasSource = names.length === columns.length + 1 && names.at(-1) === 'source';
  const ownFormat = (names.length === columns.length || hasSource) && columns.every((column, index) => names[index] === column);
  const positions = new Map(names.map((name, index) => [name, index]));
  if (positions.size !== names.length || !positions.has('title') || (!positions.has('artist') && !positions.has('artists'))) {
    throw new AppError('INVALID_CSV', 'CSV 表头需包含 title 和 artist 或 artists，且列名不能重复');
  }

  const read = (row: string[], name: string) => {
    const value = row[positions.get(name) ?? -1] ?? '';
    return ownFormat ? restoreCell(value) : value;
  };
  return importFile({
    name: (rows[0] && read(rows[0], 'playlist')) || fileName.slice(0, 200) || '导入歌单',
    platform: 'native',
    source: ownFormat && hasSource && rows[0] ? jsonField(read(rows[0], 'source')) : undefined,
    tracks: rows.map((row, index) => {
      if (row.length !== names.length) return {};
      const duration = read(row, 'duration').trim();
      const artists = read(row, 'artists');
      const identifiers = read(row, 'identifiers');
      return {
        id: read(row, 'id') || `csv:${index + 1}`,
        title: read(row, 'title'),
        artists: artists.startsWith('[') ? jsonField(artists) : [artists || read(row, 'artist')].filter(Boolean),
        album: read(row, 'album'),
        duration: duration === '' ? undefined : Number(duration),
        cover: read(row, 'cover') || undefined,
        isrc: read(row, 'isrc') || undefined,
        identifiers: identifiers ? jsonField(identifiers) : [],
      };
    }),
  });
}

function csvCell(value: string): string {
  const safe = value.startsWith("'") || spreadsheetFormula.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function exportCsv(name: string, tracks: Track[], source?: PlaylistSource): string {
  const rows = tracks.map(track => [
    name, track.id, track.title, JSON.stringify(track.artists), track.album,
    String(track.duration ?? ''), track.cover ?? '', track.isrc ?? '',
    JSON.stringify(track.identifiers), ...(source ? [JSON.stringify(source)] : []),
  ].map(csvCell).join(','));
  const header = source ? [...columns, 'source'] : columns;
  return '\uFEFF' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}
