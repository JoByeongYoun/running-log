export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          record_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          record_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          record_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "running_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          code_hash: string
          created_at: string
          group_id: string
          id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_settings: {
        Row: {
          created_at: string
          effective_week_start: string
          group_id: string
          id: string
          penalty: string
          target_meters: number
        }
        Insert: {
          created_at?: string
          effective_week_start: string
          group_id: string
          id?: string
          penalty: string
          target_meters: number
        }
        Update: {
          created_at?: string
          effective_week_start?: string
          group_id?: string
          id?: string
          penalty?: string
          target_meters?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_settings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_weeks: {
        Row: {
          created_at: string
          finalized_at: string | null
          group_id: string
          group_name_snapshot: string | null
          group_total_meters: number | null
          id: string
          penalty: string
          state: Database["public"]["Enums"]["week_state"]
          target_meters: number
          week_start: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          group_id: string
          group_name_snapshot?: string | null
          group_total_meters?: number | null
          id?: string
          penalty: string
          state?: Database["public"]["Enums"]["week_state"]
          target_meters: number
          week_start: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          group_id?: string
          group_name_snapshot?: string | null
          group_total_meters?: number | null
          id?: string
          penalty?: string
          state?: Database["public"]["Enums"]["week_state"]
          target_meters?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_weeks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          created_at: string
          group_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["join_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["join_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["join_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          event_key: string
          group_id: string | null
          id: string
          read_at: string | null
          target_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_key: string
          group_id?: string | null
          id?: string
          read_at?: string | null
          target_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_key?: string
          group_id?: string | null
          id?: string
          read_at?: string | null
          target_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_uploads: {
        Row: {
          byte_size: number
          content_type: string
          created_at: string
          expires_at: string
          group_id: string
          id: string
          ready: boolean
          storage_path: string
          user_id: string
        }
        Insert: {
          byte_size: number
          content_type: string
          created_at?: string
          expires_at: string
          group_id: string
          id?: string
          ready?: boolean
          storage_path: string
          user_id: string
        }
        Update: {
          byte_size?: number
          content_type?: string
          created_at?: string
          expires_at?: string
          group_id?: string
          id?: string
          ready?: boolean
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_uploads_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          id: string
          nickname: string | null
          onboarding_completed_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          id: string
          nickname?: string | null
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          id?: string
          nickname?: string | null
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      record_photos: {
        Row: {
          id: string
          order_index: number
          record_id: string
          storage_path: string
        }
        Insert: {
          id?: string
          order_index: number
          record_id: string
          storage_path: string
        }
        Update: {
          id?: string
          order_index?: number
          record_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_photos_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "running_records"
            referencedColumns: ["id"]
          },
        ]
      }
      record_reviews: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["record_status"] | null
          id: string
          reason: string | null
          record_id: string
          to_status: Database["public"]["Enums"]["record_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["record_status"] | null
          id?: string
          reason?: string | null
          record_id: string
          to_status: Database["public"]["Enums"]["record_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["record_status"] | null
          id?: string
          reason?: string | null
          record_id?: string
          to_status?: Database["public"]["Enums"]["record_status"]
        }
        Relationships: [
          {
            foreignKeyName: "record_reviews_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_reviews_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "running_records"
            referencedColumns: ["id"]
          },
        ]
      }
      running_records: {
        Row: {
          activity_date: string
          created_at: string
          distance_meters: number
          group_id: string
          id: string
          memo: string | null
          status: Database["public"]["Enums"]["record_status"]
          submission_key: string
          updated_at: string
          user_id: string
          version: number
          week_id: string
        }
        Insert: {
          activity_date: string
          created_at?: string
          distance_meters: number
          group_id: string
          id?: string
          memo?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          submission_key: string
          updated_at?: string
          user_id: string
          version?: number
          week_id: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          distance_meters?: number
          group_id?: string
          id?: string
          memo?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          submission_key?: string
          updated_at?: string
          user_id?: string
          version?: number
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "running_records_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_records_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "group_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      week_members: {
        Row: {
          eligible: boolean
          joined_this_week: boolean
          left_during_week: boolean
          user_id: string
          week_id: string
        }
        Insert: {
          eligible?: boolean
          joined_this_week?: boolean
          left_during_week?: boolean
          user_id: string
          week_id: string
        }
        Update: {
          eligible?: boolean
          joined_this_week?: boolean
          left_during_week?: boolean
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_members_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "group_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_results: {
        Row: {
          eligible: boolean
          nickname_snapshot: string
          outcome: Database["public"]["Enums"]["result_outcome"]
          rank: number | null
          total_meters: number
          user_id: string
          week_id: string
        }
        Insert: {
          eligible: boolean
          nickname_snapshot: string
          outcome: Database["public"]["Enums"]["result_outcome"]
          rank?: number | null
          total_meters?: number
          user_id: string
          week_id: string
        }
        Update: {
          eligible?: boolean
          nickname_snapshot?: string
          outcome?: Database["public"]["Enums"]["result_outcome"]
          rank?: number | null
          total_meters?: number
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_results_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "group_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_summary_views: {
        Row: {
          claimed_at: string
          user_id: string
          week_id: string
        }
        Insert: {
          claimed_at?: string
          user_id: string
          week_id: string
        }
        Update: {
          claimed_at?: string
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_summary_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_summary_views_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "group_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_comment: {
        Args: { p_body: string; p_record_id: string }
        Returns: string
      }
      app_now: { Args: never; Returns: string }
      app_week_close_deadline: { Args: { p: string }; Returns: string }
      app_week_start_of: { Args: { p: string }; Returns: string }
      cancel_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      cleanup_expired_uploads: { Args: never; Returns: string[] }
      create_group: {
        Args: { p_name: string; p_penalty: string; p_target_meters: number }
        Returns: {
          group_id: string
          invite_code: string
        }[]
      }
      create_upload_slot: {
        Args: { p_byte_size: number; p_content_type: string }
        Returns: {
          storage_path: string
          upload_id: string
        }[]
      }
      delete_comment: { Args: { p_comment_id: string }; Returns: undefined }
      delete_record: { Args: { p_record_id: string }; Returns: string[] }
      get_available_weeks: { Args: { p_group_id: string }; Returns: string[] }
      get_my_group_state: { Args: never; Returns: Json }
      get_week_dashboard: {
        Args: { p_group_id: string; p_week_start: string }
        Returns: Json
      }
      leave_group: { Args: never; Returns: undefined }
      lookup_invite: {
        Args: { p_code: string }
        Returns: {
          archived: boolean
          group_id: string
          name: string
          penalty: string
          target_meters: number
        }[]
      }
      mark_upload_ready: { Args: { p_upload_id: string }; Returns: undefined }
      regenerate_invite_code: { Args: { p_group_id: string }; Returns: string }
      rename_group: {
        Args: { p_group_id: string; p_name: string }
        Returns: undefined
      }
      request_join: { Args: { p_code: string }; Returns: string }
      review_join_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: undefined
      }
      review_record: {
        Args: {
          p_action: string
          p_expected_version: number
          p_reason: string
          p_record_id: string
        }
        Returns: undefined
      }
      run_week_maintenance: { Args: never; Returns: Json }
      schedule_group_settings: {
        Args: { p_group_id: string; p_penalty: string; p_target_meters: number }
        Returns: string
      }
      set_fake_now: { Args: { p: string }; Returns: undefined }
      submit_record: {
        Args: {
          p_client_date?: string
          p_distance_meters: number
          p_memo: string
          p_submission_key: string
          p_upload_ids: string[]
        }
        Returns: string
      }
      test_reset: { Args: never; Returns: undefined }
      transfer_admin: {
        Args: { p_group_id: string; p_to_user_id: string }
        Returns: undefined
      }
      update_record: {
        Args: {
          p_distance_meters: number
          p_expected_version: number
          p_keep_photo_ids: string[]
          p_memo: string
          p_record_id: string
          p_upload_ids: string[]
        }
        Returns: string[]
      }
    }
    Enums: {
      join_status: "pending" | "approved" | "rejected" | "cancelled"
      membership_role: "admin" | "member"
      record_status: "pending" | "approved" | "rejected" | "expired"
      result_outcome: "success" | "fail" | "not_evaluated"
      week_state: "open" | "closing" | "finalized"
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
      join_status: ["pending", "approved", "rejected", "cancelled"],
      membership_role: ["admin", "member"],
      record_status: ["pending", "approved", "rejected", "expired"],
      result_outcome: ["success", "fail", "not_evaluated"],
      week_state: ["open", "closing", "finalized"],
    },
  },
} as const

