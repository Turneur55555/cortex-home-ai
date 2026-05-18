
CREATE OR REPLACE FUNCTION public.ensure_home_categories_for_me()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  has_any boolean;
  cat_id uuid;
  cat record;
  sub record;
  cats jsonb := '[
    {"slug":"cuisine","name":"Cuisine","icon":"UtensilsCrossed","color":"#f97316","subs":[
      {"slug":"frigo","name":"Frigo","icon":"Refrigerator"},
      {"slug":"congelateur","name":"Congélateur","icon":"Snowflake"},
      {"slug":"placard","name":"Placards","icon":"Package"},
      {"slug":"epices","name":"Épices","icon":"Leaf"},
      {"slug":"tiroirs","name":"Tiroirs","icon":"Layers"},
      {"slug":"meuble-haut","name":"Meuble haut","icon":"Box"},
      {"slug":"meuble-bas","name":"Meuble bas","icon":"Box"}
    ]},
    {"slug":"salle-de-bain","name":"Salle de bain","icon":"Bath","color":"#06b6d4","subs":[
      {"slug":"armoire-pharmacie","name":"Armoire pharmacie","icon":"Shield"},
      {"slug":"douche","name":"Douche","icon":"Droplets"},
      {"slug":"lavabo","name":"Lavabo","icon":"Droplet"},
      {"slug":"produits-visage","name":"Produits visage","icon":"Sparkles"},
      {"slug":"produits-corps","name":"Produits corps","icon":"Heart"},
      {"slug":"serviettes","name":"Serviettes","icon":"Wind"}
    ]},
    {"slug":"chambre","name":"Chambre","icon":"Bed","color":"#8b5cf6","subs":[
      {"slug":"table-nuit","name":"Table de nuit","icon":"Moon"},
      {"slug":"armoire","name":"Armoire","icon":"Package"},
      {"slug":"commode","name":"Commode","icon":"Layers"},
      {"slug":"sous-lit","name":"Sous le lit","icon":"Box"},
      {"slug":"bureau","name":"Bureau","icon":"Monitor"},
      {"slug":"skincare","name":"Skincare","icon":"Sparkles"}
    ]},
    {"slug":"salon","name":"Salon","icon":"Sofa","color":"#10b981","subs":[
      {"slug":"meuble-tv","name":"Meuble TV","icon":"Tv"},
      {"slug":"bibliotheque","name":"Bibliothèque","icon":"BookOpen"},
      {"slug":"decoration","name":"Décoration","icon":"Star"},
      {"slug":"tiroirs","name":"Tiroirs","icon":"Layers"},
      {"slug":"console","name":"Console gaming","icon":"Gamepad2"},
      {"slug":"entretien","name":"Entretien","icon":"SprayCan"}
    ]},
    {"slug":"dressing","name":"Dressing","icon":"Shirt","color":"#ec4899","subs":[
      {"slug":"penderie","name":"Penderie","icon":"Package"},
      {"slug":"tiroirs","name":"Tiroirs","icon":"Layers"},
      {"slug":"chaussures","name":"Chaussures","icon":"Box"},
      {"slug":"accessoires","name":"Accessoires","icon":"Star"},
      {"slug":"sacs","name":"Sacs","icon":"ShoppingBag"}
    ]},
    {"slug":"bureau","name":"Bureau","icon":"Monitor","color":"#3b82f6","subs":[
      {"slug":"plan-travail","name":"Plan de travail","icon":"Monitor"},
      {"slug":"tiroirs","name":"Tiroirs","icon":"Layers"},
      {"slug":"etageres","name":"Étagères","icon":"BookOpen"},
      {"slug":"materiel","name":"Matériel tech","icon":"Box"},
      {"slug":"fournitures","name":"Fournitures","icon":"Pencil"}
    ]},
    {"slug":"entree","name":"Entrée","icon":"DoorOpen","color":"#eab308","subs":[
      {"slug":"placard","name":"Placard entrée","icon":"Package"},
      {"slug":"chaussures","name":"Chaussures","icon":"Box"},
      {"slug":"manteaux","name":"Manteaux","icon":"Shirt"},
      {"slug":"divers","name":"Divers","icon":"Layers"}
    ]},
    {"slug":"buanderie","name":"Buanderie","icon":"WashingMachine","color":"#0ea5e9","subs":[
      {"slug":"produits-lessive","name":"Produits lessive","icon":"SprayCan"},
      {"slug":"linge","name":"Linge","icon":"Wind"},
      {"slug":"repassage","name":"Repassage","icon":"Package"},
      {"slug":"produits-maison","name":"Produits maison","icon":"SprayCan"}
    ]},
    {"slug":"cave","name":"Cave","icon":"Archive","color":"#78716c","subs":[
      {"slug":"cave-vins","name":"Cave à vins","icon":"Wine"},
      {"slug":"stockage","name":"Stockage","icon":"Box"},
      {"slug":"outils","name":"Outils","icon":"Wrench"},
      {"slug":"divers","name":"Divers","icon":"Layers"}
    ]},
    {"slug":"garage","name":"Garage","icon":"Car","color":"#64748b","subs":[
      {"slug":"outils","name":"Outils","icon":"Wrench"},
      {"slug":"velos","name":"Vélos","icon":"Bike"},
      {"slug":"stockage","name":"Stockage","icon":"Box"},
      {"slug":"produits-auto","name":"Produits auto","icon":"SprayCan"}
    ]},
    {"slug":"balcon","name":"Balcon / Terrasse","icon":"TreePine","color":"#22c55e","subs":[
      {"slug":"plantes","name":"Plantes","icon":"Leaf"},
      {"slug":"mobilier","name":"Mobilier","icon":"Sofa"},
      {"slug":"jardinage","name":"Jardinage","icon":"Flower2"},
      {"slug":"stockage","name":"Stockage","icon":"Box"}
    ]}
  ]'::jsonb;
  pos int := 0;
  sub_pos int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.home_categories WHERE user_id = uid) INTO has_any;
  IF has_any THEN
    RETURN;
  END IF;

  FOR cat IN SELECT * FROM jsonb_array_elements(cats) AS c LOOP
    INSERT INTO public.home_categories (user_id, name, slug, icon, color, position)
    VALUES (
      uid,
      cat.value->>'name',
      cat.value->>'slug',
      cat.value->>'icon',
      cat.value->>'color',
      pos
    )
    RETURNING id INTO cat_id;

    sub_pos := 0;
    FOR sub IN SELECT * FROM jsonb_array_elements(cat.value->'subs') AS s LOOP
      INSERT INTO public.home_subcategories (user_id, category_id, name, slug, icon, position)
      VALUES (
        uid,
        cat_id,
        sub.value->>'name',
        sub.value->>'slug',
        sub.value->>'icon',
        sub_pos
      );
      sub_pos := sub_pos + 1;
    END LOOP;

    pos := pos + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_home_categories_for_me() TO authenticated;
