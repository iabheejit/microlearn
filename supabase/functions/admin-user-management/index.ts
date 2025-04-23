
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
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
      throw new Error('No authorization header');
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Verify the user's JWT token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
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
      
    if (roleError || !userRole || userRole.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required', code: 'not_admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { action, payload } = await req.json();
    let result;
    
    switch (action) {
      case 'fetchUsers':
        // Fetch all users
        const { data: authUsers, error: adminError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (adminError) {
          throw new Error(`Error fetching users: ${adminError.message}`);
        }
        
        // Fetch profiles and roles to combine with auth users
        const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
        const { data: userRoles } = await supabaseAdmin.from('user_roles').select('*');
        
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
          throw new Error(`Error creating user: ${createError.message}`);
        }
        
        // Assign the role
        if (newUser?.user) {
          const { error: roleAssignError } = await supabaseAdmin
            .from('user_roles')
            .insert({ 
              user_id: newUser.user.id, 
              role: role 
            });
          
          if (roleAssignError) {
            throw new Error(`Error assigning role: ${roleAssignError.message}`);
          }
        }
        
        result = { success: true, userId: newUser?.user?.id };
        break;
        
      case 'updateUser':
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
            const { error: roleError } = await supabaseAdmin
              .from('user_roles')
              .update({ role: updates.role })
              .eq('user_id', user.id);
            
            if (roleError) {
              updateSuccess = false;
              throw new Error(`Error updating role: ${roleError.message}`);
            }
          } else {
            const { error: roleError } = await supabaseAdmin
              .from('user_roles')
              .insert({ user_id: user.id, role: updates.role });
            
            if (roleError) {
              updateSuccess = false;
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
            throw new Error(`Error updating status: ${statusError.message}`);
          }
        }
        
        result = { success: updateSuccess };
        break;
        
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
