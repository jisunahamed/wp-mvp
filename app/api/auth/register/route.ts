import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { registerSchema } from '@/lib/validation/schemas';
import { generateApiKey, hashApiKey } from '@/lib/utils/api-key';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const validation = registerSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.format() },
                { status: 400 }
            );
        }

        const { email, password } = validation.data;

        // Check if user exists
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return NextResponse.json(
                { error: 'User already exists' },
                { status: 400 }
            );
        }

        // Generate API Key
        const apiKey = generateApiKey();
        const apiKeyHash = await hashApiKey(apiKey);

        // Create User
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .insert({
                email,
                api_key: apiKey, // Storing plaintext key as per spec (for recovery/display if needed, though usually bad practice)
                api_key_hash: apiKeyHash,
                plan: 'starter',
                rate_limit_daily: 500
            })
            .select('id')
            .single();

        if (error) {
            console.error('Registration error:', error);
            return NextResponse.json(
                { error: 'Registration failed' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            user_id: user.id,
            api_key: apiKey,
            message: 'Registration successful. Save your API key securely; it is your only way to access the API.'
        });

    } catch (error) {
        console.error('Registration handler error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
