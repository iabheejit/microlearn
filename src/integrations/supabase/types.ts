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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analytics: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          message: string
          response: string
          sources: Json | null
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          message: string
          response: string
          sources?: Json | null
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          message?: string
          response?: string
          sources?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_certificates: {
        Row: {
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          issued_at: string
          learner_name: string
          phone_number: string
          verification_code: string
        }
        Insert: {
          course_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          issued_at?: string
          learner_name: string
          phone_number: string
          verification_code: string
        }
        Update: {
          course_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          issued_at?: string
          learner_name?: string
          phone_number?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_course_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_quiz_questions: {
        Row: {
          correct_answer: string
          created_at: string
          explanation: string | null
          id: string
          options: Json
          question: string
          resource_id: string
          updated_at: string
        }
        Insert: {
          correct_answer: string
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question: string
          resource_id: string
          updated_at?: string
        }
        Update: {
          correct_answer?: string
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question?: string
          resource_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_quiz_questions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "course_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      course_resources: {
        Row: {
          content: string
          created_at: string
          id: string
          module_id: string
          order_index: number
          resource_type: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          module_id: string
          order_index?: number
          resource_type: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          module_id?: string
          order_index?: number
          resource_type?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_resources_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          delivery_channel: string
          description: string | null
          id: string
          instructor: string | null
          is_published: boolean
          language: string | null
          price: number
          published_at: string | null
          status: Database["public"]["Enums"]["course_status"]
          thumbnail_url: string | null
          title: string
          updated_at: string
          web_enrollment_mode: string
          whatsapp_completion_message: string | null
          whatsapp_lesson_intro: string | null
          whatsapp_welcome_template_key: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          delivery_channel?: string
          description?: string | null
          id?: string
          instructor?: string | null
          is_published?: boolean
          language?: string | null
          price?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["course_status"]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          web_enrollment_mode?: string
          whatsapp_completion_message?: string | null
          whatsapp_lesson_intro?: string | null
          whatsapp_welcome_template_key?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          delivery_channel?: string
          description?: string | null
          id?: string
          instructor?: string | null
          is_published?: boolean
          language?: string | null
          price?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["course_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          web_enrollment_mode?: string
          whatsapp_completion_message?: string | null
          whatsapp_lesson_intro?: string | null
          whatsapp_welcome_template_key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      resource_embeddings: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          resource_id: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          resource_id: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_embeddings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "course_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_contacts: {
        Row: {
          chat_id: string
          created_at: string
          first_name: string | null
          id: string
          last_interaction_at: string
          last_name: string | null
          telegram_user_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string
          first_name?: string | null
          id?: string
          last_interaction_at?: string
          last_name?: string | null
          telegram_user_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string
          first_name?: string | null
          id?: string
          last_interaction_at?: string
          last_name?: string | null
          telegram_user_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          direction: string
          id: string
          sent_at: string
          telegram_message_id: string
          update_id: string | null
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          direction: string
          id?: string
          sent_at?: string
          telegram_message_id: string
          update_id?: string | null
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          direction?: string
          id?: string
          sent_at?: string
          telegram_message_id?: string
          update_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_contacts"
            referencedColumns: ["chat_id"]
          },
        ]
      }
      user_progress: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          id: string
          progress_percentage: number | null
          resource_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          progress_percentage?: number | null
          resource_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          progress_percentage?: number | null
          resource_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "course_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      web_course_certificates: {
        Row: {
          course_id: string
          enrollment_id: string
          id: string
          issued_at: string
          user_id: string
          verification_code: string
        }
        Insert: {
          course_id: string
          enrollment_id: string
          id?: string
          issued_at?: string
          user_id: string
          verification_code: string
        }
        Update: {
          course_id?: string
          enrollment_id?: string
          id?: string
          issued_at?: string
          user_id?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_course_certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_course_certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "web_course_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      web_course_enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          current_resource_id: string | null
          enrolled_by: string | null
          enrolled_via: string
          id: string
          progress_percentage: number
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          current_resource_id?: string | null
          enrolled_by?: string | null
          enrolled_via: string
          id?: string
          progress_percentage?: number
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          current_resource_id?: string | null
          enrolled_by?: string | null
          enrolled_via?: string
          id?: string
          progress_percentage?: number
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_course_enrollments_current_resource_id_fkey"
            columns: ["current_resource_id"]
            isOneToOne: false
            referencedRelation: "course_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      web_quiz_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          enrollment_id: string
          id: string
          is_correct: boolean
          question_id: string
          submitted_answer: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          enrollment_id: string
          id?: string
          is_correct: boolean
          question_id: string
          submitted_answer: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          enrollment_id?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          submitted_answer?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_quiz_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "web_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_quiz_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "course_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          created_at: string
          id: string
          name: string | null
          phone_number: string
          updated_at: string
          wati_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          phone_number: string
          updated_at?: string
          wati_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          phone_number?: string
          updated_at?: string
          wati_id?: string | null
        }
        Relationships: []
      }
      whatsapp_course_enrollments: {
        Row: {
          awaiting_reply: boolean
          completed_at: string | null
          course_id: string
          created_at: string
          created_by: string | null
          current_resource_id: string | null
          id: string
          learner_name: string
          phone_number: string
          progress_percentage: number
          started_at: string
          status: string
          updated_at: string
          welcome_message_id: string | null
          welcome_template_name: string | null
        }
        Insert: {
          awaiting_reply?: boolean
          completed_at?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          current_resource_id?: string | null
          id?: string
          learner_name: string
          phone_number: string
          progress_percentage?: number
          started_at?: string
          status?: string
          updated_at?: string
          welcome_message_id?: string | null
          welcome_template_name?: string | null
        }
        Update: {
          awaiting_reply?: boolean
          completed_at?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          current_resource_id?: string | null
          id?: string
          learner_name?: string
          phone_number?: string
          progress_percentage?: number
          started_at?: string
          status?: string
          updated_at?: string
          welcome_message_id?: string | null
          welcome_template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_course_enrollments_current_resource_id_fkey"
            columns: ["current_resource_id"]
            isOneToOne: false
            referencedRelation: "course_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string
          created_at: string
          delivered_at: string | null
          direction: string
          failed_at: string | null
          id: string
          phone_number: string
          provider_message_id: string | null
          read_at: string | null
          sent_at: string
          status: string
          status_error: string | null
          template_name: string | null
        }
        Insert: {
          content: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          failed_at?: string | null
          id?: string
          phone_number: string
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string
          status?: string
          status_error?: string | null
          template_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          failed_at?: string | null
          id?: string
          phone_number?: string
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string
          status?: string
          status_error?: string | null
          template_name?: string | null
        }
        Relationships: []
      }
      whatsapp_progression_events: {
        Row: {
          completed_at: string | null
          created_at: string
          enrollment_id: string
          id: string
          outcome: string | null
          provider_message_id: string
          response_text: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          outcome?: string | null
          provider_message_id: string
          response_text?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          outcome?: string | null
          provider_message_id?: string
          response_text?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_progression_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_course_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_quiz_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          enrollment_id: string
          id: string
          is_correct: boolean
          progression_event_id: string | null
          question_id: string
          submitted_answer: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          enrollment_id: string
          id?: string
          is_correct: boolean
          progression_event_id?: string | null
          question_id: string
          submitted_answer: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          enrollment_id?: string
          id?: string
          is_correct?: boolean
          progression_event_id?: string | null
          question_id?: string
          submitted_answer?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_quiz_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_quiz_attempts_progression_event_id_fkey"
            columns: ["progression_event_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_progression_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_quiz_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "course_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          send_job_id: string | null
          status: string
          template_version_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          send_job_id?: string | null
          status: string
          template_version_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          send_job_id?: string | null
          status?: string
          template_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_template_events_send_job_id_fkey"
            columns: ["send_job_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_template_send_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_events_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_send_jobs: {
        Row: {
          attempt_count: number
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          parameters: Json
          provider_message_id: string | null
          provider_response: Json | null
          read_at: string | null
          recipient_phone: string
          sent_at: string | null
          status: string
          template_version_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          parameters?: Json
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          recipient_phone: string
          sent_at?: string | null
          status?: string
          template_version_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          parameters?: Json
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          recipient_phone?: string
          sent_at?: string | null
          status?: string
          template_version_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_template_send_jobs_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_versions: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          language: string
          last_checked_at: string | null
          provider_response: Json | null
          provider_template_id: string | null
          provider_template_name: string
          rejection_reason: string | null
          review_status: string
          sample_values: Json
          submitted_at: string | null
          submitted_by: string | null
          template_key: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          last_checked_at?: string | null
          provider_response?: Json | null
          provider_template_id?: string | null
          provider_template_name: string
          rejection_reason?: string | null
          review_status?: string
          sample_values?: Json
          submitted_at?: string | null
          submitted_by?: string | null
          template_key: string
          updated_at?: string
          version: number
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          last_checked_at?: string | null
          provider_response?: Json | null
          provider_template_id?: string | null
          provider_template_name?: string
          rejection_reason?: string | null
          review_status?: string
          sample_values?: Json
          submitted_at?: string | null
          submitted_by?: string | null
          template_key?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
          variables: string[] | null
          wati_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          variables?: string[] | null
          wati_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          variables?: string[] | null
          wati_id?: string | null
        }
        Relationships: []
      }
      whatsapp_webhook_callbacks: {
        Row: {
          created_at: string
          delivery_id: string
          error_message: string | null
          event_type: string
          id: string
          phone_number: string | null
          processed_at: string | null
          provider_message_id: string | null
          received_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          error_message?: string | null
          event_type: string
          id?: string
          phone_number?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          received_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          error_message?: string | null
          event_type?: string
          id?: string
          phone_number?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          received_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_web_progression: {
        Args: {
          p_advance: boolean
          p_complete: boolean
          p_enrollment_id: string
          p_expected_resource_id: string
          p_is_correct: boolean
          p_next_resource_id: string
          p_progress: number
          p_question_id: string
          p_submitted_answer: string
          p_user_id: string
        }
        Returns: Json
      }
      apply_whatsapp_progression: {
        Args: {
          p_advance: boolean
          p_complete: boolean
          p_enrollment_id: string
          p_event_id: string
          p_expected_resource_id: string
          p_is_correct: boolean
          p_next_resource_id: string
          p_outcome: string
          p_progress: number
          p_question_id: string
          p_response_text: string
          p_submitted_answer: string
        }
        Returns: undefined
      }
      find_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      match_course_resources: {
        Args: {
          match_count?: number
          query_embedding: string
          requested_course_id?: string
        }
        Returns: {
          content: string
          course_id: string
          module_id: string
          resource_id: string
          resource_type: string
          similarity: number
          title: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "content_creator" | "learner"
      course_status: "draft" | "published" | "archived"
      user_status: "active" | "inactive" | "suspended"
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
  public: {
    Enums: {
      app_role: ["admin", "content_creator", "learner"],
      course_status: ["draft", "published", "archived"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
