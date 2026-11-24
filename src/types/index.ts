export interface AnimeSummary {
  id: string;
  title: string;
  url: string;
  image?: string;
  description?: string;
  status?: string;
  type?: string;
  episodes?: number;
}

export interface AnimeDetails extends AnimeSummary {
  alternativeTitles?: string[];
  genres?: string[];
  rating?: string;
  season?: string;
  releaseYear?: number;
}

export interface Episode {
  id: string;
  number: number;
  title?: string;
  url: string;
  thumbnail?: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
