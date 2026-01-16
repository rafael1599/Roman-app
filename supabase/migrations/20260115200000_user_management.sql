-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Staff Member'), 
    'staff' -- Default role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Policies for Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true); -- Needed for basic auth checks

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 5. Helper Function to check Admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Secure Inventory Table (RLS)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Remove old loose policies if any (best guess names, or generic wipe if needed manually)
-- Defining STRICT policies now.

DROP POLICY IF EXISTS "Inventory Admin Access" ON inventory;
CREATE POLICY "Inventory Admin Access"
  ON inventory FOR ALL
  USING (is_admin());

DROP POLICY IF EXISTS "Inventory Staff Read" ON inventory;
CREATE POLICY "Inventory Staff Read"
  ON inventory FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Inventory Staff Insert" ON inventory;
CREATE POLICY "Inventory Staff Insert"
  ON inventory FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'); 

DROP POLICY IF EXISTS "Inventory Staff Update" ON inventory;
CREATE POLICY "Inventory Staff Update"
  ON inventory FOR UPDATE
  USING (auth.role() = 'authenticated');
  
-- DELETE is NOT granted to non-admins by omission.

-- 7. Secure Locations Table
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Locations Admin Access" ON locations;
CREATE POLICY "Locations Admin Access"
  ON locations FOR ALL
  USING (is_admin());

DROP POLICY IF EXISTS "Locations Staff Read" ON locations;
CREATE POLICY "Locations Staff Read"
  ON locations FOR SELECT
  USING (true);

-- Staff cannot Insert/Update/Delete locations (Implicitly denied)
