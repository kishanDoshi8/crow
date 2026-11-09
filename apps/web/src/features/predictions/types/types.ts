// scheduled: written ahead, only organizers see it until it goes live
// (opens_at) · draft: open for picks · locked: waiting for the result.
export type PredictionStatus = 'scheduled' | 'draft' | 'locked' | 'revealed' | 'cancelled' | 'no_result'

export interface PredictionTag {
  id:            string
  prediction_id: string
  tag:           string
  created_at:    string
}

export interface PredictionOption {
  id:            string
  prediction_id: string
  label:         string
  display_order: number
  total_bet:     number
}

export interface Prediction {
  id:                string
  room_id:           string
  series_id?:        string | null
  series_prediction_number?: number | null
  series_title?:     string | null
  seriesId?:         string | null
  seriesPredictionNumber?: number | null
  seriesTitle?:      string | null
  tags?:             PredictionTag[]
  // Optional context for the prediction page: how it's decided, etc.
  description?:      string | null
  title:             string
  status:            PredictionStatus
  // deadline is supabase timstamp string, e.g. "2024-06-01T12:00:00Z"
  deadline:          string
  // When it goes live (scheduled) or went live; null on older predictions.
  opens_at?:         string | null
  winning_option_id: string | null
  // created_at:        string
  resolved_at:       string | null
  // Staff member who revealed, marked no result, or cancelled it.
  resolved_by?:      string | null
  // Organizer who last fixed the result, and when.
  corrected_by?:     string | null
  corrected_at?:     string | null
  // False for results revealed before corrections existed.
  ratings_reversible?: boolean
  // Results can be corrected only while the series runs.
  seriesStatus?:     string | null
  prediction_options: PredictionOption[]
  no_result_reason?: string | null
}