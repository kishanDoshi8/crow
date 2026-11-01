export type PredictionStatus = 'draft' | 'locked' | 'revealed' | 'cancelled' | 'no_result'

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
  winning_option_id: string | null
  // created_at:        string
  resolved_at:       string | null
  // Staff member who revealed, marked no result, or cancelled it.
  resolved_by?:      string | null
  prediction_options: PredictionOption[]
  no_result_reason?: string | null
}