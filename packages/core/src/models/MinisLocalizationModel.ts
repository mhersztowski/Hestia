export interface MinisLocalizationModel {
  type: 'localization';
  id: string;
  name: string;
  typ: 'place' | 'geo';
  place: string | null;
  geo: { lat: number; lon: number } | null;
  device: string;
}

export interface MinisLocalizationsModel {
  type: 'localizations';
  localizations: MinisLocalizationModel[];
}
