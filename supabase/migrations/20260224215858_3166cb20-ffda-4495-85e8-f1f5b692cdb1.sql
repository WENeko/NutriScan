
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  goals JSONB NOT NULL DEFAULT '{"calories": 2000, "proteins": 150, "carbs": 250, "fats": 70}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Meals table
CREATE TABLE public.meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  image_url TEXT,
  raw_ai_analysis TEXT,
  total_calories NUMERIC DEFAULT 0,
  total_proteins NUMERIC DEFAULT 0,
  total_carbs NUMERIC DEFAULT 0,
  total_fats NUMERIC DEFAULT 0,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meals" ON public.meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meals" ON public.meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meals" ON public.meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meals" ON public.meals FOR DELETE USING (auth.uid() = user_id);

-- Meal items table
CREATE TABLE public.meal_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  calories NUMERIC DEFAULT 0,
  proteins NUMERIC DEFAULT 0,
  carbs NUMERIC DEFAULT 0,
  fats NUMERIC DEFAULT 0
);

ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meal items" ON public.meal_items 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.meals WHERE meals.id = meal_items.meal_id AND meals.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own meal items" ON public.meal_items 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.meals WHERE meals.id = meal_items.meal_id AND meals.user_id = auth.uid())
  );
CREATE POLICY "Users can update own meal items" ON public.meal_items 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.meals WHERE meals.id = meal_items.meal_id AND meals.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own meal items" ON public.meal_items 
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.meals WHERE meals.id = meal_items.meal_id AND meals.user_id = auth.uid())
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for meal images
INSERT INTO storage.buckets (id, name, public) VALUES ('meal-images', 'meal-images', true);

CREATE POLICY "Users can upload meal images" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view meal images" ON storage.objects 
  FOR SELECT USING (bucket_id = 'meal-images');

CREATE POLICY "Users can delete own meal images" ON storage.objects 
  FOR DELETE USING (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1]);
