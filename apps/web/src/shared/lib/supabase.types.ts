export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bets: {
        Row: {
          amount: number
          id: string
          option_id: string
          payout: number | null
          placed_at: string
          rating_change: number | null
          player_id: string
          prediction_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          id?: string
          option_id: string
          payout?: number | null
          placed_at?: string
          rating_change?: number | null
          player_id: string
          prediction_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          id?: string
          option_id?: string
          payout?: number | null
          placed_at?: string
          rating_change?: number | null
          player_id?: string
          prediction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bets_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "prediction_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      duel_queue: {
        Row: {
          bet_id: string
          created_at: string
          duel_id: string
          id: string
          player_id: string
          status: string
        }
        Insert: {
          bet_id: string
          created_at?: string
          duel_id: string
          id?: string
          player_id: string
          status?: string
        }
        Update: {
          bet_id?: string
          created_at?: string
          duel_id?: string
          id?: string
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "duel_queue_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duel_queue_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "duels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duel_queue_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      duels: {
        Row: {
          challenger_bet_id: string
          challenger_player_id: string
          created_at: string
          fee_amount: number
          id: string
          matched_at: string | null
          matched_opponent_bet_id: string | null
          matched_opponent_player_id: string | null
          prediction_id: string
          resolved_at: string | null
          stake_amount: number
          status: string
        }
        Insert: {
          challenger_bet_id: string
          challenger_player_id: string
          created_at?: string
          fee_amount: number
          id?: string
          matched_at?: string | null
          matched_opponent_bet_id?: string | null
          matched_opponent_player_id?: string | null
          prediction_id: string
          resolved_at?: string | null
          stake_amount: number
          status: string
        }
        Update: {
          challenger_bet_id?: string
          challenger_player_id?: string
          created_at?: string
          fee_amount?: number
          id?: string
          matched_at?: string | null
          matched_opponent_bet_id?: string | null
          matched_opponent_player_id?: string | null
          prediction_id?: string
          resolved_at?: string | null
          stake_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "duels_challenger_bet_id_fkey"
            columns: ["challenger_bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duels_challenger_player_id_fkey"
            columns: ["challenger_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duels_matched_opponent_bet_id_fkey"
            columns: ["matched_opponent_bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duels_matched_opponent_player_id_fkey"
            columns: ["matched_opponent_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duels_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_preferences: {
        Row: {
          created_at: string
          dark_mode: boolean
          deadline_1h: boolean
          has_seen_how_to_play: boolean
          has_seen_ratings_tip: boolean
          player_id: string
          prediction_live: boolean
          prediction_locked: boolean
          result_needed: boolean
          result_revealed: boolean
          sounds_enabled: boolean
          updated_at: string
          weekly_points_claim: boolean
        }
        Insert: {
          created_at?: string
          dark_mode?: boolean
          deadline_1h?: boolean
          has_seen_how_to_play?: boolean
          has_seen_ratings_tip?: boolean
          player_id: string
          prediction_live?: boolean
          prediction_locked?: boolean
          result_needed?: boolean
          result_revealed?: boolean
          sounds_enabled?: boolean
          updated_at?: string
          weekly_points_claim?: boolean
        }
        Update: {
          created_at?: string
          dark_mode?: boolean
          deadline_1h?: boolean
          has_seen_how_to_play?: boolean
          has_seen_ratings_tip?: boolean
          player_id?: string
          prediction_live?: boolean
          prediction_locked?: boolean
          result_needed?: boolean
          result_revealed?: boolean
          sounds_enabled?: boolean
          updated_at?: string
          weekly_points_claim?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "player_preferences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_room_stats: {
        Row: {
          created_at: string
          id: string
          room_id: string
          stat_key: string
          stat_value_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          room_id: string
          stat_key: string
          stat_value_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          room_id?: string
          stat_key?: string
          stat_value_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_room_stats_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "player_room_stats_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_room_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_claim_at: string | null
          last_visited_room_id: string | null
          longest_streak: number
          player_token: string
          points_balance: number
          points_in_escrow: number
          total_won: number
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_claim_at?: string | null
          last_visited_room_id?: string | null
          longest_streak?: number
          player_token: string
          points_balance?: number
          points_in_escrow?: number
          total_won?: number
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_claim_at?: string | null
          last_visited_room_id?: string | null
          longest_streak?: number
          player_token?: string
          points_balance?: number
          points_in_escrow?: number
          total_won?: number
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_last_visited_room_id_fkey"
            columns: ["last_visited_room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "players_last_visited_room_id_fkey"
            columns: ["last_visited_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          label: string
          prediction_id: string
          total_bet: number
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          label: string
          prediction_id: string
          total_bet?: number
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string
          prediction_id?: string
          total_bet?: number
        }
        Relationships: [
          {
            foreignKeyName: "prediction_options_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_tags: {
        Row: {
          created_at: string
          id: string
          prediction_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          id?: string
          prediction_id: string
          tag: string
        }
        Update: {
          created_at?: string
          id?: string
          prediction_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_tags_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          affects_rating: boolean
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          created_by: string
          description: string | null
          deadline: string
          id: string
          no_result_reason: string | null
          notified_1h: boolean
          notified_result_needed: boolean
          ratings_reversible: boolean
          resolved_at: string | null
          resolved_by: string | null
          room_id: string
          series_id: string | null
          series_prediction_number: number | null
          status: string
          title: string
          winning_option_id: string | null
        }
        Insert: {
          affects_rating?: boolean
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          deadline: string
          id?: string
          no_result_reason?: string | null
          notified_1h?: boolean
          notified_result_needed?: boolean
          ratings_reversible?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          room_id: string
          series_id?: string | null
          series_prediction_number?: number | null
          status?: string
          title: string
          winning_option_id?: string | null
        }
        Update: {
          affects_rating?: boolean
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          deadline?: string
          id?: string
          no_result_reason?: string | null
          notified_1h?: boolean
          notified_result_needed?: boolean
          ratings_reversible?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string
          series_id?: string | null
          series_prediction_number?: number | null
          status?: string
          title?: string
          winning_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_predictions_winning_option"
            columns: ["winning_option_id"]
            isOneToOne: false
            referencedRelation: "prediction_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "predictions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_system_config: {
        Row: {
          base_k: number
          created_at: string
          is_active: boolean
          min_participants: number
          version: number
        }
        Insert: {
          base_k: number
          created_at?: string
          is_active: boolean
          min_participants: number
          version: number
        }
        Update: {
          base_k?: number
          created_at?: string
          is_active?: boolean
          min_participants?: number
          version?: number
        }
        Relationships: []
      }
      room_activities: {
        Row: {
          activity_tier: number
          activity_type: string
          click_action: Json | null
          created_at: string
          created_by_player_id: string | null
          dedupe_key: string | null
          id: string
          metadata: Json
          room_id: string
        }
        Insert: {
          activity_tier: number
          activity_type: string
          click_action?: Json | null
          created_at?: string
          created_by_player_id?: string | null
          dedupe_key?: string | null
          id?: string
          metadata?: Json
          room_id: string
        }
        Update: {
          activity_tier?: number
          activity_type?: string
          click_action?: Json | null
          created_at?: string
          created_by_player_id?: string | null
          dedupe_key?: string | null
          id?: string
          metadata?: Json
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_activities_created_by_player_id_fkey"
            columns: ["created_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_activities_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "room_activities_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_member_milestones: {
        Row: {
          achieved_at: string
          created_at: string
          id: string
          milestone_type: string
          player_id: string
          room_id: string
          series_id: string | null
        }
        Insert: {
          achieved_at: string
          created_at?: string
          id?: string
          milestone_type: string
          player_id: string
          room_id: string
          series_id?: string | null
        }
        Update: {
          achieved_at?: string
          created_at?: string
          id?: string
          milestone_type?: string
          player_id?: string
          room_id?: string
          series_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_member_milestones_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_member_milestones_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "room_member_milestones_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_member_milestones_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_member_milestones_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          current_streak: number
          highest_streak: number
          id: string
          is_organizer: boolean | null
          joined_at: string
          joined_via: string | null
          last_activity_seen_at: string | null
          peak_prediction_rating: number
          player_id: string
          prediction_rating: number
          rated_predictions_count: number
          rating_system_version: number
          role: string
          room_id: string
          total_won_in_room: number
        }
        Insert: {
          current_streak?: number
          highest_streak?: number
          id?: string
          is_organizer?: boolean | null
          joined_at?: string
          joined_via?: string | null
          last_activity_seen_at?: string | null
          peak_prediction_rating?: number
          player_id: string
          prediction_rating?: number
          rated_predictions_count?: number
          rating_system_version?: number
          role?: string
          room_id: string
          total_won_in_room?: number
        }
        Update: {
          current_streak?: number
          highest_streak?: number
          id?: string
          is_organizer?: boolean | null
          joined_at?: string
          joined_via?: string | null
          last_activity_seen_at?: string | null
          peak_prediction_rating?: number
          player_id?: string
          prediction_rating?: number
          rated_predictions_count?: number
          rating_system_version?: number
          role?: string
          room_id?: string
          total_won_in_room?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_preferences: {
        Row: {
          created_at: string
          dark_mode: boolean | null
          deadline_1h: boolean | null
          id: string
          player_id: string
          prediction_live: boolean | null
          prediction_locked: boolean | null
          result_needed: boolean | null
          result_revealed: boolean | null
          room_id: string
          sounds_enabled: boolean | null
          updated_at: string
          weekly_points_claim: boolean | null
        }
        Insert: {
          created_at?: string
          dark_mode?: boolean | null
          deadline_1h?: boolean | null
          id?: string
          player_id: string
          prediction_live?: boolean | null
          prediction_locked?: boolean | null
          result_needed?: boolean | null
          result_revealed?: boolean | null
          room_id: string
          sounds_enabled?: boolean | null
          updated_at?: string
          weekly_points_claim?: boolean | null
        }
        Update: {
          created_at?: string
          dark_mode?: boolean | null
          deadline_1h?: boolean | null
          id?: string
          player_id?: string
          prediction_live?: boolean | null
          prediction_locked?: boolean | null
          result_needed?: boolean | null
          result_revealed?: boolean | null
          room_id?: string
          sounds_enabled?: boolean | null
          updated_at?: string
          weekly_points_claim?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "room_preferences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_preferences_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "room_preferences_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_stats: {
        Row: {
          created_at: string
          id: string
          room_id: string
          stat_key: string
          stat_value_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          room_id: string
          stat_key: string
          stat_value_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          room_id?: string
          stat_key?: string
          stat_value_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_stats_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "room_stats_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          predictions_limit: number
          result_reminder_hours: number
          room_code: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          predictions_limit?: number
          result_reminder_hours?: number
          room_code: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          predictions_limit?: number
          result_reminder_hours?: number
          room_code?: string
          status?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          archived_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          expected_games: number
          final_games: number | null
          final_players: number | null
          id: string
          last_topup_recipients: number
          last_topup_week: string | null
          min_bets_to_rank: number
          room_id: string
          started_at: string | null
          starting_stack: number
          status: string
          tier: string | null
          title: string
          topups_paid: number
          weekly_topup: number
        }
        Insert: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          expected_games?: number
          final_games?: number | null
          final_players?: number | null
          id?: string
          last_topup_recipients?: number
          last_topup_week?: string | null
          min_bets_to_rank?: number
          room_id: string
          started_at?: string | null
          starting_stack?: number
          status?: string
          tier?: string | null
          title: string
          topups_paid?: number
          weekly_topup?: number
        }
        Update: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          expected_games?: number
          final_games?: number | null
          final_players?: number | null
          id?: string
          last_topup_recipients?: number
          last_topup_week?: string | null
          min_bets_to_rank?: number
          room_id?: string
          started_at?: string | null
          starting_stack?: number
          status?: string
          tier?: string | null
          title?: string
          topups_paid?: number
          weekly_topup?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "series_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      series_awards: {
        Row: {
          award_type: Database["public"]["Enums"]["series_award_type"]
          collected_at: string | null
          created_at: string
          description: string
          id: string
          player_id: string
          series_id: string
          tier: string | null
          value: number
        }
        Insert: {
          award_type: Database["public"]["Enums"]["series_award_type"]
          collected_at?: string | null
          created_at?: string
          description: string
          id?: string
          player_id: string
          series_id: string
          tier?: string | null
          value: number
        }
        Update: {
          award_type?: Database["public"]["Enums"]["series_award_type"]
          collected_at?: string | null
          created_at?: string
          description?: string
          id?: string
          player_id?: string
          series_id?: string
          tier?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_awards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_awards_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_awards_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      series_placements: {
        Row: {
          collected_at: string | null
          created_at: string
          id: string
          placement: number
          player_id: string
          points: number
          series_id: string
        }
        Insert: {
          collected_at?: string | null
          created_at?: string
          id?: string
          placement: number
          player_id: string
          points: number
          series_id: string
        }
        Update: {
          collected_at?: string | null
          created_at?: string
          id?: string
          placement?: number
          player_id?: string
          points?: number
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_placements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_placements_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_placements_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      series_standing_snapshots: {
        Row: {
          balance: number
          created_at: string
          is_ranked: boolean
          player_id: string
          rank: number | null
          series_id: string
          week_key: string
        }
        Insert: {
          balance: number
          created_at?: string
          is_ranked: boolean
          player_id: string
          rank?: number | null
          series_id: string
          week_key: string
        }
        Update: {
          balance?: number
          created_at?: string
          is_ranked?: boolean
          player_id?: string
          rank?: number | null
          series_id?: string
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_standing_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_standing_snapshots_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_standing_snapshots_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      series_suggestion_votes: {
        Row: {
          created_at: string
          player_id: string
          suggestion_id: string
        }
        Insert: {
          created_at?: string
          player_id: string
          suggestion_id: string
        }
        Update: {
          created_at?: string
          player_id?: string
          suggestion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_suggestion_votes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_suggestion_votes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "series_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      series_suggestions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          room_id: string
          series_id: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          room_id: string
          series_id?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          room_id?: string
          series_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_suggestions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_suggestions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "series_suggestions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_suggestions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_suggestions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      series_wallets: {
        Row: {
          balance: number
          created_at: string
          escrow: number
          granted: number
          player_id: string
          series_id: string
          updated_at: string
        }
        Insert: {
          balance: number
          created_at?: string
          escrow?: number
          granted: number
          player_id: string
          series_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          escrow?: number
          granted?: number
          player_id?: string
          series_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_wallets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_wallets_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_wallets_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      share_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          player_id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          player_id: string
          room_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          player_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "share_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_subscriptions: {
        Row: {
          created_at: string
          id: string
          subscription: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subscription: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subscription?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_claims: {
        Row: {
          auto_claimed: boolean
          claimed_at: string
          id: string
          player_id: string
          week_key: string
        }
        Insert: {
          auto_claimed?: boolean
          claimed_at?: string
          id?: string
          player_id: string
          week_key: string
        }
        Update: {
          auto_claimed?: boolean
          claimed_at?: string
          id?: string
          player_id?: string
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_claims_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      player_rooms_by_activity: {
        Row: {
          active_prediction_count: number | null
          created_at: string | null
          latest_prediction_at: string | null
          member_count: number | null
          name: string | null
          player_id: string | null
          predictions_limit: number | null
          room_code: string | null
          room_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      series_with_stats: {
        Row: {
          active_predictions: number | null
          archived_at: string | null
          cancelled_predictions: number | null
          completed_at: string | null
          completed_games: number | null
          completed_predictions: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          expected_games: number | null
          has_bets: boolean | null
          id: string | null
          min_bets_to_rank: number | null
          prediction_count: number | null
          progress_percentage: number | null
          remaining_games: number | null
          room_id: string | null
          started_at: string | null
          starting_stack: number | null
          status: string | null
          title: string | null
          topups_paid: number | null
          total_predictions: number | null
          weekly_topup: number | null
        }
        Relationships: [
          {
            foreignKeyName: "series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "player_rooms_by_activity"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "series_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_series: { Args: { p_series_id: string }; Returns: Json }
      allow_room_member_back: {
        Args: { p_player_id: string; p_room_id: string }
        Returns: Json
      }
      archive_series: { Args: { p_series_id: string }; Returns: Json }
      cancel_account_deletion: { Args: never; Returns: Json }
      cancel_bet: { Args: { p_prediction_id: string }; Returns: Json }
      cancel_duel: {
        Args: { p_duel_id: string; p_player_id: string }
        Returns: {
          challenger_bet_id: string
          challenger_player_id: string
          created_at: string
          fee_amount: number
          id: string
          matched_at: string | null
          matched_opponent_bet_id: string | null
          matched_opponent_player_id: string | null
          prediction_id: string
          resolved_at: string | null
          stake_amount: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "duels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_duel_queue: {
        Args: { p_duel_id: string; p_player_id: string }
        Returns: {
          challenger_bet_id: string
          challenger_player_id: string
          created_at: string
          fee_amount: number
          id: string
          matched_at: string | null
          matched_opponent_bet_id: string | null
          matched_opponent_player_id: string | null
          prediction_id: string
          resolved_at: string | null
          stake_amount: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "duels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_duel_queue_view: {
        Args: { p_duel_id: string; p_player_id: string }
        Returns: Json
      }
      cancel_duel_view: {
        Args: { p_duel_id: string; p_player_id: string }
        Returns: Json
      }
      claim_weekly_points: { Args: { p_auto_claimed?: boolean }; Returns: Json }
      collect_series_rewards: { Args: { series_id: string }; Returns: Json }
      complete_series: { Args: { p_series_id: string }; Returns: Json }
      correct_prediction_result: {
        Args: {
          p_no_result_reason?: string
          p_outcome: string
          p_prediction_id: string
          p_room_id: string
          p_winning_option_id?: string
        }
        Returns: Json
      }
      create_duel: {
        Args: {
          p_bet_id: string
          p_challenger_player_id: string
          p_prediction_id: string
          p_stake_amount: number
        }
        Returns: {
          challenger_bet_id: string
          challenger_player_id: string
          created_at: string
          fee_amount: number
          id: string
          matched_at: string | null
          matched_opponent_bet_id: string | null
          matched_opponent_player_id: string | null
          prediction_id: string
          resolved_at: string | null
          stake_amount: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "duels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_duel_view: {
        Args: {
          p_bet_id: string
          p_challenger_player_id: string
          p_prediction_id: string
          p_stake_amount: number
        }
        Returns: Json
      }
      create_prediction: {
        Args: {
          p_deadline: string
          p_options: string[]
          p_room_id: string
          p_series_id?: string
          p_title: string
        }
        Returns: Json
      }
      create_room: { Args: { p_room_name: string }; Returns: Json }
      create_series: {
        Args: {
          p_description?: string
          p_expected_games?: number
          p_min_bets_to_rank?: number
          p_room_id: string
          p_starting_stack?: number
          p_title: string
          p_weekly_topup?: number
        }
        Returns: Json
      }
      delete_my_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      get_my_account_deletion: { Args: never; Returns: Json }
      get_my_series_wallets: { Args: { p_room_id: string }; Returns: Json }
      get_player: { Args: never; Returns: Json }
      get_prediction_duel_summary: {
        Args: { p_prediction_id: string }
        Returns: Json
      }
      get_prediction_duels_view: {
        Args: { p_prediction_id: string }
        Returns: Json
      }
      get_preferences: { Args: { p_room_id?: string }; Returns: Json }
      get_room_activities: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_filter?: string
          p_limit?: number
          p_room_id: string
          p_series_id?: string
        }
        Returns: Json
      }
      get_room_by_code: { Args: { p_room_code: string }; Returns: Json }
      get_room_former_members: { Args: { p_room_id: string }; Returns: Json }
      get_room_has_unseen_activities: {
        Args: { p_room_id: string }
        Returns: boolean
      }
      get_room_invite_preview: { Args: { p_room_code: string }; Returns: Json }
      get_room_manage_queue: { Args: { p_room_id: string }; Returns: Json }
      get_room_member_recent_predictions: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_player_id: string
          p_room_id: string
        }
        Returns: Json
      }
      get_room_member_stats: {
        Args: { p_player_id: string; p_room_id: string }
        Returns: Json
      }
      get_room_member_style: {
        Args: { p_player_id: string; p_room_id: string }
        Returns: Json
      }
      get_room_overall_standings: { Args: { p_room_id: string }; Returns: Json }
      get_room_prediction_history: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_filter?: string
          p_limit?: number
          p_room_id: string
          p_search?: string
          p_series_id?: string
        }
        Returns: Json
      }
      get_room_series: { Args: { p_room_id: string }; Returns: Json }
      get_room_series_selector: {
        Args: {
          p_mode?: string
          p_room_id: string
          p_selected_series_id?: string
        }
        Returns: Json
      }
      get_room_stat_cards: {
        Args: { p_limit?: number; p_room_id: string }
        Returns: Json
      }
      get_series_active_predictions: {
        Args: { p_room_id: string; p_series_id: string }
        Returns: Json
      }
      get_series_awards: {
        Args: { p_room_id: string; p_series_id: string }
        Returns: Json
      }
      get_series_completed_predictions: {
        Args: { p_room_id: string; p_series_id: string }
        Returns: Json
      }
      get_series_leaderboard: {
        Args: { p_room_id: string; p_series_id: string; p_sort_by?: string }
        Returns: Json
      }
      get_series_placements: {
        Args: { p_room_id: string; p_series_id: string }
        Returns: Json
      }
      get_series_suggestions: { Args: { p_room_id: string }; Returns: Json }
      get_series_weekly_recap: {
        Args: { p_room_id: string; p_series_id: string }
        Returns: Json
      }
      join_duel_queue: {
        Args: { p_bet_id: string; p_duel_id: string; p_player_id: string }
        Returns: {
          challenger_bet_id: string
          challenger_player_id: string
          created_at: string
          fee_amount: number
          id: string
          matched_at: string | null
          matched_opponent_bet_id: string | null
          matched_opponent_player_id: string | null
          prediction_id: string
          resolved_at: string | null
          stake_amount: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "duels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_duel_queue_view: {
        Args: { p_bet_id: string; p_duel_id: string; p_player_id: string }
        Returns: Json
      }
      join_room: {
        Args: { p_ref?: string; p_room_code: string }
        Returns: Json
      }
      leave_room: { Args: { p_room_id: string }; Returns: Json }
      lock_prediction: { Args: { p_prediction_id: string }; Returns: Json }
      mark_how_to_play_seen: { Args: never; Returns: undefined }
      mark_ratings_tip_seen: { Args: never; Returns: undefined }
      mark_room_activities_seen: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      mark_series_suggestion_played: {
        Args: { p_series_id: string; p_suggestion_id: string }
        Returns: undefined
      }
      place_bet: {
        Args: { p_amount: number; p_option_id: string; p_prediction_id: string }
        Returns: Json
      }
      record_share: {
        Args: { p_kind: string; p_room_id: string }
        Returns: undefined
      }
      register_player: { Args: { p_username: string }; Returns: Json }
      remove_room_member: {
        Args: { p_player_id: string; p_room_id: string }
        Returns: Json
      }
      remove_series_suggestion: {
        Args: { p_suggestion_id: string }
        Returns: undefined
      }
      request_account_deletion: {
        Args: { p_reason?: string }
        Returns: Json
      }
      reset_room_preferences: { Args: { p_room_id: string }; Returns: Json }
      resolve_duels_for_prediction: {
        Args: { p_prediction_id: string }
        Returns: Json
      }
      resolve_prediction_v2: {
        Args: {
          p_no_result_reason?: string
          p_outcome: string
          p_prediction_id: string
          p_room_id: string
          p_winning_option_id?: string
        }
        Returns: Json
      }
      set_last_visited_room: { Args: { p_room_id: string }; Returns: undefined }
      set_member_role: {
        Args: { p_player_id: string; p_role: string; p_room_id: string }
        Returns: Json
      }
      suggest_series: {
        Args: { p_room_id: string; p_title: string }
        Returns: Json
      }
      toggle_series_suggestion_vote: {
        Args: { p_suggestion_id: string }
        Returns: boolean
      }
      transfer_ownership: {
        Args: { p_player_id: string; p_room_id: string }
        Returns: Json
      }
      update_global_preferences: {
        Args: {
          p_dark_mode: boolean
          p_deadline_1h: boolean
          p_prediction_live: boolean
          p_prediction_locked: boolean
          p_result_needed?: boolean
          p_result_revealed: boolean
          p_sounds_enabled: boolean
          p_weekly_points_claim: boolean
        }
        Returns: Json
      }
      update_player_stats_after_resolution: {
        Args: {
          p_outcome: string
          p_prediction_id: string
          p_room_id: string
          p_winning_option_id: string
        }
        Returns: undefined
      }
      update_prediction: {
        Args: {
          p_deadline: string
          p_options?: string[]
          p_prediction_id: string
          p_title: string
        }
        Returns: Json
      }
      update_prediction_ratings: {
        Args: {
          p_prediction_id: string
          p_room_id: string
          p_winning_option_id: string
        }
        Returns: undefined
      }
      update_room: {
        Args: {
          p_description: string
          p_name: string
          p_predictions_limit: number
          p_result_reminder_hours: number
          p_room_id: string
        }
        Returns: Json
      }
      update_room_preferences: {
        Args: {
          p_dark_mode?: boolean
          p_deadline_1h?: boolean
          p_prediction_live?: boolean
          p_prediction_locked?: boolean
          p_result_needed?: boolean
          p_result_revealed?: boolean
          p_room_id: string
          p_sounds_enabled?: boolean
          p_weekly_points_claim?: boolean
        }
        Returns: Json
      }
      update_room_stats_after_resolution: {
        Args: {
          p_outcome: string
          p_prediction_id: string
          p_room_id: string
          p_winning_option_id: string
        }
        Returns: undefined
      }
      update_series: {
        Args: {
          p_description?: string
          p_expected_games?: number
          p_min_bets_to_rank?: number
          p_series_id: string
          p_starting_stack?: number
          p_title: string
          p_weekly_topup?: number
        }
        Returns: Json
      }
      update_streaks_after_resolution: {
        Args: {
          p_outcome: string
          p_prediction_id: string
          p_room_id: string
          p_winning_option_id: string
        }
        Returns: undefined
      }
      upsert_user_push_subscription: {
        Args: { p_subscription: Json }
        Returns: string
      }
    }
    Enums: {
      series_award_type:
        | "LONGEST_STREAK"
        | "BIGGEST_PROFIT"
        | "MOST_DUEL_WINS"
        | "MOST_POINTS_RISKED"
        | "EVER_PRESENT"
        | "SHARPSHOOTER"
        | "UNDERDOG"
        | "COMEBACK"
        | "HOT_FINISH"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      series_award_type: [
        "LONGEST_STREAK",
        "BIGGEST_PROFIT",
        "MOST_DUEL_WINS",
        "MOST_POINTS_RISKED",
        "EVER_PRESENT",
        "SHARPSHOOTER",
        "UNDERDOG",
        "COMEBACK",
        "HOT_FINISH",
      ],
    },
  },
} as const
