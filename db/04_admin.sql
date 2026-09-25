DO $$ 
DECLARE 
  uid uuid; 
BEGIN
  -- Check if user exists
  SELECT id INTO uid FROM auth.users WHERE email = 'superadmin-glowix-books@buildstart.io';
  
  IF uid IS NULL THEN
    -- Insert user
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
      recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 
      'superadmin-glowix-books@buildstart.io', crypt('hpwiE78@!Bdeci', gen_salt('bf')), now(), 
      now(), now(), '{"provider":"email","providers":["email"]}', '{}', 
      now(), now(), '', '', '', ''
    ) RETURNING id INTO uid;

    -- Insert identity for email login
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), uid::text, uid, format('{"sub":"%s","email":"superadmin-glowix-books@buildstart.io"}', uid)::jsonb, 'email', now(), now(), now()
    );
  END IF;

  -- Wait a tiny bit for triggers to run, though inside transaction they run synchronously.
  
  -- Let's just update their role to super_admin and plan to enterprise.
  UPDATE glowix_books.user_roles SET role = 'super_admin' WHERE user_id = uid;
  UPDATE glowix_books.profiles SET plan_tier = 'enterprise' WHERE user_id = uid;
  
END $$;
