import { Genre, Stem, StemType, Track } from '@prisma/client';

export type TrackWithGenreAndStems = Track & {
  genre: Genre | null;
  stems: Stem[];
};

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getZipFilename(artist: string, title: string, version?: string | null): string {
  const versionSegment = version ? ` (${version})` : '';
  const rawName = `${artist} - ${title}${versionSegment} - Stems Lossless.zip`;
  return sanitizeFilename(rawName);
}

const STEM_TYPE_LABELS: Record<StemType, { prefix: string; label: string }> = {
  [StemType.DRUMS]: { prefix: '01', label: 'Drums' },
  [StemType.BASS]: { prefix: '02', label: 'Bass' },
  [StemType.SYNTHS]: { prefix: '03', label: 'Synths' },
  [StemType.VOCALS]: { prefix: '04', label: 'Vocals' },
  [StemType.INSTRUMENTS]: { prefix: '05', label: 'Instruments' },
  [StemType.OTHER]: { prefix: '06', label: 'Other' },
};

export function getStemFilename(stem: Stem, trackSlug: string): string {
  const mapping = STEM_TYPE_LABELS[stem.type] || { prefix: '99', label: 'Stem' };
  
  let extension = '.wav';
  try {
    const parsedPath = stem.audioUrl.split('?')[0];
    const match = parsedPath.match(/\.([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      extension = `.${match[1].toLowerCase()}`;
    }
  } catch {
    extension = '.wav';
  }

  return `${mapping.prefix}_${mapping.label}_${trackSlug}${extension}`;
}

export function generateMetadataFileContent(track: TrackWithGenreAndStems): string {
  const minutes = Math.floor(track.durationSeconds / 60);
  const seconds = (track.durationSeconds % 60).toString().padStart(2, '0');
  const trackSlug = slugify(`${track.artist}_${track.title}`);

  const stemsList = track.stems
    .map((stem) => {
      const filename = getStemFilename(stem, trackSlug);
      return `  - ${filename} (${stem.name})`;
    })
    .join('\n');

  return [
    '================================================================================',
    'REMIX DOCK - FICHA TÉCNICA Y METADATOS DE STEMS MULTIPISTA',
    '================================================================================',
    '',
    `Título:             ${track.title}`,
    `Artista:            ${track.artist}`,
    `Versión:            ${track.version || 'Original Mix'}`,
    `Remixer/Productor:  ${track.remixer || 'RemixDock Official'}`,
    `Género:             ${track.genre?.name || 'Electronic'}`,
    `BPM:                ${track.bpm}`,
    `Tonalidad Armónica: ${track.musicalKey}`,
    `Duración:           ${minutes}:${seconds} min`,
    '',
    'CONTENIDO DEL PAQUETE MULTIPISTA:',
    stemsList,
    '',
    'LICENCIA Y DERECHOS DE USO EN CABINA:',
    'Pistas y stems multipista autorizados para sesiones de DJ en directo, mezclas en',
    'cabina, radioshows y directos para usuarios verificados en RemixDock.',
    'Queda prohibida su reventa o redistribución pública no autorizada sin pérdidas.',
    '================================================================================',
  ].join('\n');
}
