import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize the Supabase client with the Service Role Key
    // This is necessary to use the admin.deleteUser() method
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // 2. Initialize a second client for the user to verify their identity
    // We use the user's own JWT from the Authorization header
    const authHeader = req.headers.get('Authorization')!
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
      }
    )

    // 3. Verify the user's identity (prevents hijacking)
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()

    if (authError || !user) {
      throw new Error('Unauthorized: Invalid user session')
    }

    // 4. Perform the actual deletion of the Auth user
    // This is the final, irreversible step
    const { error: adminError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (adminError) {
      throw adminError
    }

    return new Response(
      JSON.stringify({ message: `User ${user.id} successfully deleted.` }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    console.error('Error in delete-user function:', error.message)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: error.message.includes('Unauthorized') ? 401 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
