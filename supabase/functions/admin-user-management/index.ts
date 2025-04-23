import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the service role key for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    console.log('Creating admin client with URL:', supabaseUrl);
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing environment variables for Supabase connection');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the current user's token from the request headers
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Verify the user's JWT token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check if the user has admin role
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    // For debugging - log user and role info
    console.log('User ID:', user.id);
    console.log('User role data:', userRole);
    console.log('Role error:', roleError);
      
    // Check for admin role
    if (roleError || !userRole || userRole.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required', code: 'not_admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Proceed with the action
    const { action, payload } = await req.json();
    let result;
    
    switch (action) {
      case 'fetchUsers':
        console.log('Fetching users with admin client');
        // Fetch all users
        const { data: authUsers, error: adminError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (adminError) {
          console.error('Error fetching users:', adminError);
          throw new Error(`Error fetching users: ${adminError.message}`);
        }
        
        console.log('Auth users count:', authUsers?.users?.length || 0);
        
        // Fetch profiles and roles to combine with auth users
        const { data: profiles, error: profilesError } = await supabaseAdmin.from('profiles').select('*');
        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
        }
        
        const { data: userRoles, error: rolesError } = await supabaseAdmin.from('user_roles').select('*');
        if (rolesError) {
          console.error('Error fetching user roles:', rolesError);
        }
        
        console.log('Profiles count:', profiles?.length || 0);
        console.log('User roles count:', userRoles?.length || 0);
        
        // Map to the expected format
        result = authUsers.users.map(authUser => {
          const profile = profiles?.find(p => p.id === authUser.id) || {};
          const userRole = userRoles?.find(ur => ur.user_id === authUser.id);
          
          return {
            id: parseInt(authUser.id.substring(0, 8), 16), // Convert first 8 chars of UUID to number
            name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || authUser.email?.split('@')[0] || 'Unknown',
            email: authUser.email || 'No email',
            role: userRole?.role || 'learner',
            courses: 0, // This would need additional lookup if needed
            joined: new Date(authUser.created_at).toISOString().split('T')[0],
            status: authUser.banned_until ? "inactive" : "active"
          };
        });
        break;
        
      case 'inviteUser':
        const { email, role } = payload;
        
        // Generate a random password for the initial account
        const tempPassword = Array(16).fill(0).map(() => Math.random().toString(36).charAt(2)).join('');
        
        // Create the user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true, // Auto-confirm the email
        });
        
        if (createError) {
          console.error('Error creating user:', createError);
          throw new Error(`Error creating user: ${createError.message}`);
        }
        
        // Assign the role - First check if a role already exists for this user
        if (newUser?.user) {
          // Check if user already has any role assigned
          const { data: existingRole } = await supabaseAdmin
            .from('user_roles')
            .select()
            .eq('user_id', newUser.user.id)
            .maybeSingle();
            
          if (existingRole) {
            // Update existing role if different
            if (existingRole.role !== role) {
              const { error: roleUpdateError } = await supabaseAdmin
                .from('user_roles')
                .update({ role: role })
                .eq('user_id', newUser.user.id);
                
              if (roleUpdateError) {
                console.error('Error updating role:', roleUpdateError);
                throw new Error(`Error updating role: ${roleUpdateError.message}`);
              }
            }
          } else {
            // Insert new role record
            const { error: roleAssignError } = await supabaseAdmin
              .from('user_roles')
              .insert({ 
                user_id: newUser.user.id, 
                role: role 
              });
            
            if (roleAssignError) {
              console.error('Error assigning role:', roleAssignError);
              throw new Error(`Error assigning role: ${roleAssignError.message}`);
            }
          }
        }
        
        result = { success: true, userId: newUser?.user?.id };
        break;
        
      case 'updateUser': {
        const { userId, updates } = payload;
        // Find the actual uuid from the display id
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.users.find(u => parseInt(u.id.substring(0, 8), 16) === userId);
        if (!user) {
          throw new Error(`User with ID ${userId} not found`);
        }
        let updateSuccess = true;

        // Update name (profiles table)
        if (updates.name) {
          const nameParts = updates.name.split(' ');
          const first_name = nameParts[0];
          const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ first_name, last_name })
            .eq('id', user.id);
          if (profileError) {
            updateSuccess = false;
            console.error('Error updating profile:', profileError);
            throw new Error(`Error updating profile: ${profileError.message}`);
          }
        }

        // Update role if provided
        if (updates.role) {
          // Check if user already has a role record
          const { data: existingRole } = await supabaseAdmin
            .from('user_roles')
            .select()
            .eq('user_id', user.id)
            .maybeSingle();

          if (existingRole) {
            if (existingRole.role !== updates.role) {
              const { error: roleError } = await supabaseAdmin
                .from('user_roles')
                .update({ role: updates.role })
                .eq('user_id', user.id);
              if (roleError) {
                updateSuccess = false;
                console.error('Error updating role:', roleError);
                throw new Error(`Error updating role: ${roleError.message}`);
              }
            }
          } else {
            // Insert a new role record if not present
            const { error: roleError } = await supabaseAdmin
              .from('user_roles')
              .insert({ user_id: user.id, role: updates.role });
            if (roleError) {
              updateSuccess = false;
              console.error('Error creating role:', roleError);
              throw new Error(`Error creating role: ${roleError.message}`);
            }
          }
        }

        // Update status (banned/active)
        if (updates.status !== undefined) {
          const { error: statusError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { 
              banned_until: updates.status === 'inactive' ? '2100-01-01T00:00:00.000Z' : null 
            }
          );
          if (statusError) {
            updateSuccess = false;
            console.error('Error updating status:', statusError);
            throw new Error(`Error updating status: ${statusError.message}`);
          }
        }
        result = { success: updateSuccess };
        break;
      }
      
      case 'deleteUser':
        const deleteUserId = payload.userId;
        
        // Find the actual uuid from the display id
        const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers();
        const userToDelete = allUsers?.users.find(u => parseInt(u.id.substring(0, 8), 16) === deleteUserId);
        
        if (!userToDelete) {
          throw new Error(`User with ID ${deleteUserId} not found`);
        }
        
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
          userToDelete.id
        );
        
        if (deleteError) {
          console.error('Error deleting user:', deleteError);
          throw new Error(`Error deleting user: ${deleteError.message}`);
        }
        
        result = { success: true };
        break;
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in admin-user-management function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
