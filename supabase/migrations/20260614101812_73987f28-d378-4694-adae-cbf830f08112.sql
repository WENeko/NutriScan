-- coach_messages UPDATE policy
CREATE POLICY "Users can update own coach messages"
ON public.coach_messages FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- water_logs UPDATE policy
CREATE POLICY "Users can update own water logs"
ON public.water_logs FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- user_roles UPDATE policy (admins only)
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- meal-images storage: restrict listing to owner folder
DROP POLICY IF EXISTS "Anyone can view meal images" ON storage.objects;
CREATE POLICY "Users can view own meal images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- meal-images storage: UPDATE scoped to owner folder
CREATE POLICY "Users can update own meal images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'meal-images' AND auth.uid()::text = (storage.foldername(name))[1]);