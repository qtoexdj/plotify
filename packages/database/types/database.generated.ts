export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_custom_instructions: {
        Row: {
          created_at: string | null
          id: string
          instructions: string
          is_active: boolean | null
          organization_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructions: string
          is_active?: boolean | null
          organization_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instructions?: string
          is_active?: boolean | null
          organization_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_custom_instructions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          category: string
          created_at: string | null
          description: string
          enabled_by_default: boolean | null
          id: string
          is_system: boolean | null
          mcp_provider: string | null
          name: string
          requires_mcp: boolean | null
          requires_role: string[] | null
          slug: string
          tool_definition: Json
        }
        Insert: {
          category?: string
          created_at?: string | null
          description: string
          enabled_by_default?: boolean | null
          id?: string
          is_system?: boolean | null
          mcp_provider?: string | null
          name: string
          requires_mcp?: boolean | null
          requires_role?: string[] | null
          slug: string
          tool_definition: Json
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          enabled_by_default?: boolean | null
          id?: string
          is_system?: boolean | null
          mcp_provider?: string | null
          name?: string
          requires_mcp?: boolean | null
          requires_role?: string[] | null
          slug?: string
          tool_definition?: Json
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          admin_phone: string | null
          created_at: string
          id: string
          lot_id: string
          organization_id: string
          payload: Json
          resolved_at: string | null
          status: string
          vendor_id: string
          vendor_name: string
          vendor_phone: string
          vendor_platform: string
        }
        Insert: {
          admin_phone?: string | null
          created_at?: string
          id?: string
          lot_id: string
          organization_id: string
          payload?: Json
          resolved_at?: string | null
          status?: string
          vendor_id: string
          vendor_name: string
          vendor_phone: string
          vendor_platform: string
        }
        Update: {
          admin_phone?: string | null
          created_at?: string
          id?: string
          lot_id?: string
          organization_id?: string
          payload?: Json
          resolved_at?: string | null
          status?: string
          vendor_id?: string
          vendor_name?: string
          vendor_phone?: string
          vendor_platform?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          actor: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          organization_id: string | null
          payload: Json | null
        }
        Insert: {
          action?: string | null
          actor?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
        }
        Update: {
          action?: string | null
          actor?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_blobs: {
        Row: {
          blob: string | null
          channel: string
          checkpoint_ns: string
          thread_id: string
          type: string
          version: string
        }
        Insert: {
          blob?: string | null
          channel: string
          checkpoint_ns?: string
          thread_id: string
          type: string
          version: string
        }
        Update: {
          blob?: string | null
          channel?: string
          checkpoint_ns?: string
          thread_id?: string
          type?: string
          version?: string
        }
        Relationships: []
      }
      checkpoint_migrations: {
        Row: {
          v: number
        }
        Insert: {
          v: number
        }
        Update: {
          v?: number
        }
        Relationships: []
      }
      checkpoint_writes: {
        Row: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns: string
          idx: number
          task_id: string
          task_path: string
          thread_id: string
          type: string | null
        }
        Insert: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns?: string
          idx: number
          task_id: string
          task_path?: string
          thread_id: string
          type?: string | null
        }
        Update: {
          blob?: string
          channel?: string
          checkpoint_id?: string
          checkpoint_ns?: string
          idx?: number
          task_id?: string
          task_path?: string
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      checkpoints: {
        Row: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns: string
          metadata: Json
          parent_checkpoint_id: string | null
          thread_id: string
          type: string | null
        }
        Insert: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id: string
          type?: string | null
        }
        Update: {
          checkpoint?: Json
          checkpoint_id?: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      dead_letter_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          id: string
          job_function: string
          payload: Json
          traceback: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_function: string
          payload?: Json
          traceback?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_function?: string
          payload?: Json
          traceback?: string | null
        }
        Relationships: []
      }
      document_blocks: {
        Row: {
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          tags: string[] | null
          updated_at: string | null
          variables: string[] | null
          version: number | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          tags?: string[] | null
          updated_at?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          tags?: string[] | null
          updated_at?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          document_type: string
          footer_config: Json | null
          header_config: Json | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          page_config: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type: string
          footer_config?: Json | null
          header_config?: Json | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          page_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          footer_config?: Json | null
          header_config?: Json | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          page_config?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          created_at: string | null
          document_type: string
          file_format: string
          file_url: string
          generated_by: string | null
          id: string
          lot_id: string | null
          lot_record_id: string | null
          organization_id: string
          template_id: string
          variables_snapshot: Json
          version_number: number
          missing_variables_accepted: boolean
          missing_variables: Json
          selected_recipients: string[]
          delivery_status: string
          delivery_failed_attempts: number
          delivery_error_message: string | null
          delivery_metadata: Json
        }
        Insert: {
          created_at?: string | null
          document_type: string
          file_format?: string
          file_url: string
          generated_by?: string | null
          id?: string
          lot_id?: string | null
          lot_record_id?: string | null
          organization_id: string
          template_id: string
          variables_snapshot: Json
          version_number?: number
          missing_variables_accepted?: boolean
          missing_variables?: Json
          selected_recipients?: string[]
          delivery_status?: string
          delivery_failed_attempts?: number
          delivery_error_message?: string | null
          delivery_metadata?: Json
        }
        Update: {
          created_at?: string | null
          document_type?: string
          file_format?: string
          file_url?: string
          generated_by?: string | null
          id?: string
          lot_id?: string | null
          lot_record_id?: string | null
          organization_id?: string
          template_id?: string
          variables_snapshot?: Json
          version_number?: number
          missing_variables_accepted?: boolean
          missing_variables?: Json
          selected_recipients?: string[]
          delivery_status?: string
          delivery_failed_attempts?: number
          delivery_error_message?: string | null
          delivery_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_lot_record_id_fkey"
            columns: ["lot_record_id"]
            isOneToOne: false
            referencedRelation: "lot_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      geometries: {
        Row: {
          created_at: string
          geometry: Json
          geometry_type: Database["public"]["Enums"]["geometry_type"]
          id: string
          is_assigned: boolean
          lot_id: string | null
          name: string | null
          project_id: string
          properties: Json | null
          source_type: Database["public"]["Enums"]["source_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          geometry: Json
          geometry_type?: Database["public"]["Enums"]["geometry_type"]
          id?: string
          is_assigned?: boolean
          lot_id?: string | null
          name?: string | null
          project_id: string
          properties?: Json | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          geometry?: Json
          geometry_type?: Database["public"]["Enums"]["geometry_type"]
          id?: string
          is_assigned?: boolean
          lot_id?: string | null
          name?: string | null
          project_id?: string
          properties?: Json | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geometries_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          id: string
          name: string | null
          organization_id: string | null
          phone: string
          platform: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          organization_id?: string | null
          phone: string
          platform: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          organization_id?: string | null
          phone?: string
          platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_records: {
        Row: {
          abono: number | null
          cbr_estado: string | null
          cbr_fecha_salida_estimada: string | null
          cbr_numero_petitorio: string | null
          cbr_reparo: string | null
          cliente_direccion: string | null
          cliente_email: string | null
          cliente_estado_civil: string | null
          cliente_nombre: string | null
          cliente_ocupacion: string | null
          cliente_run: string | null
          cliente_run_normalizado: string | null
          cliente_telefono: string | null
          comision_monto: number | null
          comision_pagada_at: string | null
          created_at: string
          detalle_deuda: string | null
          etapa_proceso: string
          firma_estado: string | null
          firma_fecha: string | null
          firma_lugar: string | null
          gasto_abogado: number | null
          gasto_cbr: number | null
          gasto_notaria: number | null
          id: string
          lot_id: string
          saldo: number | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          abono?: number | null
          cbr_estado?: string | null
          cbr_fecha_salida_estimada?: string | null
          cbr_numero_petitorio?: string | null
          cbr_reparo?: string | null
          cliente_direccion?: string | null
          cliente_email?: string | null
          cliente_estado_civil?: string | null
          cliente_nombre?: string | null
          cliente_ocupacion?: string | null
          cliente_run?: string | null
          cliente_run_normalizado?: string | null
          cliente_telefono?: string | null
          comision_monto?: number | null
          comision_pagada_at?: string | null
          created_at?: string
          detalle_deuda?: string | null
          etapa_proceso?: string
          firma_estado?: string | null
          firma_fecha?: string | null
          firma_lugar?: string | null
          gasto_abogado?: number | null
          gasto_cbr?: number | null
          gasto_notaria?: number | null
          id?: string
          lot_id: string
          saldo?: number | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          abono?: number | null
          cbr_estado?: string | null
          cbr_fecha_salida_estimada?: string | null
          cbr_numero_petitorio?: string | null
          cbr_reparo?: string | null
          cliente_direccion?: string | null
          cliente_email?: string | null
          cliente_estado_civil?: string | null
          cliente_nombre?: string | null
          cliente_ocupacion?: string | null
          cliente_run?: string | null
          cliente_run_normalizado?: string | null
          cliente_telefono?: string | null
          comision_monto?: number | null
          comision_pagada_at?: string | null
          created_at?: string
          detalle_deuda?: string | null
          etapa_proceso?: string
          firma_estado?: string | null
          firma_fecha?: string | null
          firma_lugar?: string | null
          gasto_abogado?: number | null
          gasto_cbr?: number | null
          gasto_notaria?: number | null
          id?: string
          lot_id?: string
          saldo?: number | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_records_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: true
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          area_official_m2: number | null
          boundaries_official: Json | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_lote"]
          geometry_id: string | null
          id: string
          m2: number | null
          numero_lote: string
          observaciones: string | null
          perimeter_official_m: number | null
          precio: number | null
          project_id: string
          reserved_at: string | null
          servidumbre_ancho_m: number | null
          servidumbre_m2: number | null
          sold_at: string | null
          superficie_neta_m2: number | null
          updated_at: string
          valor_reserva: number | null
          vendedor_id: string | null
          verified_at: string | null
          verified_by: string | null
          verified_status: string
        }
        Insert: {
          area_official_m2?: number | null
          boundaries_official?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_lote"]
          geometry_id?: string | null
          id?: string
          m2?: number | null
          numero_lote: string
          observaciones?: string | null
          perimeter_official_m?: number | null
          precio?: number | null
          project_id: string
          reserved_at?: string | null
          servidumbre_ancho_m?: number | null
          servidumbre_m2?: number | null
          sold_at?: string | null
          superficie_neta_m2?: number | null
          updated_at?: string
          valor_reserva?: number | null
          vendedor_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_status?: string
        }
        Update: {
          area_official_m2?: number | null
          boundaries_official?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_lote"]
          geometry_id?: string | null
          id?: string
          m2?: number | null
          numero_lote?: string
          observaciones?: string | null
          perimeter_official_m?: number | null
          precio?: number | null
          project_id?: string
          reserved_at?: string | null
          servidumbre_ancho_m?: number | null
          servidumbre_m2?: number | null
          sold_at?: string | null
          superficie_neta_m2?: number | null
          updated_at?: string
          valor_reserva?: number | null
          vendedor_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_geometry_fk"
            columns: ["geometry_id"]
            isOneToOne: false
            referencedRelation: "geometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_vendor_project_fkey"
            columns: ["vendedor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "vendor_projects"
            referencedColumns: ["vendor_id", "project_id"]
          },
        ]
      }
      mcp_connections: {
        Row: {
          created_at: string | null
          credentials_encrypted: string
          display_name: string
          id: string
          last_error: string | null
          last_health_check: string | null
          organization_id: string
          provider: string
          scopes: string[] | null
          server_url: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credentials_encrypted: string
          display_name: string
          id?: string
          last_error?: string | null
          last_health_check?: string | null
          organization_id: string
          provider: string
          scopes?: string[] | null
          server_url?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credentials_encrypted?: string
          display_name?: string
          id?: string
          last_error?: string | null
          last_health_check?: string | null
          organization_id?: string
          provider?: string
          scopes?: string[] | null
          server_url?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_skill_configs: {
        Row: {
          config_overrides: Json | null
          created_at: string | null
          enabled: boolean | null
          enabled_by: string | null
          id: string
          organization_id: string
          skill_id: string
          updated_at: string | null
        }
        Insert: {
          config_overrides?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          enabled_by?: string | null
          id?: string
          organization_id: string
          skill_id: string
          updated_at?: string | null
        }
        Update: {
          config_overrides?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          enabled_by?: string | null
          id?: string
          organization_id?: string
          skill_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_skill_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_skill_configs_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_payment_info: {
        Row: {
          banco: string
          created_at: string | null
          email_transferencia: string | null
          id: string
          numero_cuenta: string
          organization_id: string
          razon_social: string
          rut: string
          tipo_cuenta: string
          updated_at: string | null
        }
        Insert: {
          banco: string
          created_at?: string | null
          email_transferencia?: string | null
          id?: string
          numero_cuenta: string
          organization_id: string
          razon_social: string
          rut: string
          tipo_cuenta?: string
          updated_at?: string | null
        }
        Update: {
          banco?: string
          created_at?: string | null
          email_transferencia?: string | null
          id?: string
          numero_cuenta?: string
          organization_id?: string
          razon_social?: string
          rut?: string
          tipo_cuenta?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_payment_info_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_personal: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_personal?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_personal?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          first_name: string | null
          id: string
          is_super_admin: boolean
          last_name: string | null
          phone: string | null
          telegram_chat_id: string | null
          updated_at: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          first_name?: string | null
          id: string
          is_super_admin?: boolean
          last_name?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          first_name?: string | null
          id?: string
          is_super_admin?: boolean
          last_name?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      project_active_templates: {
        Row: {
          project_id: string
          document_type: string
          template_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          project_id: string
          document_type: string
          template_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          project_id?: string
          document_type?: string
          template_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_active_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_active_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          }
        ]
      }
      projects: {
        Row: {
          comuna: string | null
          created_at: string
          descripcion: string | null
          doc_dominio_vigente: string | null
          doc_hipoteca_gravamen: string | null
          doc_otros: string | null
          doc_plano_oficial: string | null
          doc_roles: string | null
          doc_subdivision: string | null
          estado: string
          id: string
          images: string[] | null
          name: string
          organization_id: string
          region: string | null
          road_geometry: Json | null
          road_width_m: number | null
          total_lotes: number
          updated_at: string
        }
        Insert: {
          comuna?: string | null
          created_at?: string
          descripcion?: string | null
          doc_dominio_vigente?: string | null
          doc_hipoteca_gravamen?: string | null
          doc_otros?: string | null
          doc_plano_oficial?: string | null
          doc_roles?: string | null
          doc_subdivision?: string | null
          estado?: string
          id?: string
          images?: string[] | null
          name: string
          organization_id: string
          region?: string | null
          road_geometry?: Json | null
          road_width_m?: number | null
          total_lotes: number
          updated_at?: string
        }
        Update: {
          comuna?: string | null
          created_at?: string
          descripcion?: string | null
          doc_dominio_vigente?: string | null
          doc_hipoteca_gravamen?: string | null
          doc_otros?: string | null
          doc_plano_oficial?: string | null
          doc_roles?: string | null
          doc_subdivision?: string | null
          estado?: string
          id?: string
          images?: string[] | null
          name?: string
          organization_id?: string
          region?: string | null
          road_geometry?: Json | null
          road_width_m?: number | null
          total_lotes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          author_id: string | null
          change_note: string | null
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          prompt_id: string
          tested_at: string | null
          version: number
        }
        Insert: {
          author_id?: string | null
          change_note?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          prompt_id: string
          tested_at?: string | null
          version: number
        }
        Update: {
          author_id?: string | null
          change_note?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          prompt_id?: string
          tested_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      telegram_bots: {
        Row: {
          bot_token_encrypted: string
          bot_username: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          bot_token_encrypted: string
          bot_username: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          bot_token_encrypted?: string
          bot_username?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_bots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_block_items: {
        Row: {
          block_id: string
          condition_field: string | null
          id: string
          is_optional: boolean | null
          overrides: Json | null
          position: number
          template_id: string
        }
        Insert: {
          block_id: string
          condition_field?: string | null
          id?: string
          is_optional?: boolean | null
          overrides?: Json | null
          position: number
          template_id: string
        }
        Update: {
          block_id?: string
          condition_field?: string | null
          id?: string
          is_optional?: boolean | null
          overrides?: Json | null
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_block_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "document_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_block_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_projects: {
        Row: {
          created_at: string
          project_id: string
          rol: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          rol?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          rol?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_projects_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          organization_id: string | null
          owner_id: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_user_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_mcp_connection: {
        Args: {
          p_credentials: string
          p_display_name: string
          p_org_id: string
          p_provider: string
          p_scopes?: string[]
          p_server_url?: string
          p_user_id: string
        }
        Returns: string
      }
      approve_reservation: {
        Args: { p_admin_phone: string; p_approval_id: string }
        Returns: Json
      }
      can_manage_project_files: {
        Args: { project_id_text: string }
        Returns: boolean
      }
      can_read_project_files: {
        Args: { project_id_text: string }
        Returns: boolean
      }
      decrypt_credential: { Args: { p_encrypted: string }; Returns: string }
      encrypt_credential: { Args: { p_plaintext: string }; Returns: string }
      get_decrypted_bot_token: { Args: { p_org_id: string }; Returns: string }
      get_mcp_credentials: {
        Args: { p_org_id: string; p_provider: string; p_user_id: string }
        Returns: string
      }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_user: { Args: { org_id: string }; Returns: boolean }
      is_project_admin: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_project_vendor: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      register_telegram_bot: {
        Args: {
          p_org_id: string
          p_token: string
          p_username: string
          p_webhook_url: string
        }
        Returns: undefined
      }
      reject_reservation: {
        Args: { p_admin_phone?: string; p_approval_id: string }
        Returns: Json
      }
      seed_default_document_blocks: {
        Args: { p_org_id: string; p_user_id?: string }
        Returns: number
      }
      seed_escritura_blocks: {
        Args: { p_org_id: string; p_user_id?: string }
        Returns: number
      }
    }
    Enums: {
      estado_lote: "disponible" | "reservado" | "vendido"
      geometry_type: "lot" | "road" | "common_area"
      org_role: "admin" | "user"
      sale_state: "propuesta" | "reservado" | "vendido" | "cancelado"
      source_type: "kmz" | "kml" | "dxf" | "dwg"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      estado_lote: ["disponible", "reservado", "vendido"],
      geometry_type: ["lot", "road", "common_area"],
      org_role: ["admin", "user"],
      sale_state: ["propuesta", "reservado", "vendido", "cancelado"],
      source_type: ["kmz", "kml", "dxf", "dwg"],
    },
  },
} as const

