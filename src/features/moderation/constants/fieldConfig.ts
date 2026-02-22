// ── Field type definitions ──

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'multiselect'

export type FieldConfig = {
  key: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
}

export type FieldSection = {
  title: string
  fields: FieldConfig[]
}

// ── Enum options ──

const GENDER_OPTIONS = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
  { value: 'other', label: 'Autre' },
]

const ZONE_OPTIONS = [
  { value: 'north', label: 'Nord' },
  { value: 'center', label: 'Centre' },
  { value: 'south', label: 'Sud' },
  { value: 'other', label: 'Autre' },
]

const HOUSING_OPTIONS = [
  { value: 'owner', label: 'Proprietaire' },
  { value: 'renter', label: 'Locataire' },
  { value: 'hosted', label: 'Heberge' },
  { value: 'other', label: 'Autre' },
]

const RELATIONSHIP_OPTIONS = [
  { value: 'single', label: 'Celibataire' },
  { value: 'separated', label: 'Separe(e)' },
  { value: 'divorced', label: 'Divorce(e)' },
  { value: 'widowed', label: 'Veuf/Veuve' },
  { value: 'other', label: 'Autre' },
]

const ALCOHOL_OPTIONS = [
  { value: 'no', label: 'Non' },
  { value: 'occasional', label: 'Occasionnel' },
  { value: 'yes', label: 'Oui' },
]

const SPORT_OPTIONS = [
  { value: 'never', label: 'Jamais' },
  { value: 'sometimes', label: 'Parfois' },
  { value: 'regular', label: 'Regulier' },
]

const ZODIAC_OPTIONS = [
  { value: 'aries', label: 'Belier' },
  { value: 'taurus', label: 'Taureau' },
  { value: 'gemini', label: 'Gemeaux' },
  { value: 'cancer', label: 'Cancer' },
  { value: 'leo', label: 'Lion' },
  { value: 'virgo', label: 'Vierge' },
  { value: 'libra', label: 'Balance' },
  { value: 'scorpio', label: 'Scorpion' },
  { value: 'sagittarius', label: 'Sagittaire' },
  { value: 'capricorn', label: 'Capricorne' },
  { value: 'aquarius', label: 'Verseau' },
  { value: 'pisces', label: 'Poissons' },
]

const RELIGION_OPTIONS = [
  { value: 'christian', label: 'Chretien(ne)' },
  { value: 'muslim', label: 'Musulman(e)' },
  { value: 'hindu', label: 'Hindou(e)' },
  { value: 'buddhist', label: 'Bouddhiste' },
  { value: 'jewish', label: 'Juif/Juive' },
  { value: 'none', label: 'Aucune' },
  { value: 'other', label: 'Autre' },
]

const SKIN_TONE_OPTIONS = [
  { value: 'light', label: 'Clair' },
  { value: 'medium', label: 'Moyen' },
  { value: 'dark', label: 'Fonce' },
  { value: 'ebony', label: 'Ebene' },
]

const HAIR_LENGTH_OPTIONS = [
  { value: 'shaved', label: 'Rase' },
  { value: 'short', label: 'Court' },
  { value: 'medium', label: 'Moyen' },
  { value: 'long', label: 'Long' },
]

const HAIR_TEXTURE_OPTIONS = [
  { value: 'straight', label: 'Lisse' },
  { value: 'wavy', label: 'Ondule' },
  { value: 'curly', label: 'Boucle' },
  { value: 'coily', label: 'Crepu' },
]

const HAIR_STYLE_OPTIONS = [
  { value: 'natural', label: 'Naturel' },
  { value: 'braids', label: 'Tresses' },
  { value: 'locs', label: 'Locks' },
  { value: 'relaxed', label: 'Defrise' },
  { value: 'other', label: 'Autre' },
]

const CLOTHING_SIZE_OPTIONS = [
  { value: 'XS', label: 'XS' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
  { value: 'XXL', label: 'XXL' },
]

const FASHION_STYLE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'chic', label: 'Chic' },
  { value: 'boheme', label: 'Boheme' },
  { value: 'streetwear', label: 'Streetwear' },
  { value: 'classic', label: 'Classique' },
  { value: 'sport', label: 'Sport' },
]

// ── Profile field sections ──

export const PROFILE_FIELD_SECTIONS: FieldSection[] = [
  {
    title: 'Identite',
    fields: [
      { key: 'first_name', label: 'Prenom', type: 'text' },
      { key: 'last_name', label: 'Nom', type: 'text' },
      { key: 'birthdate', label: 'Date de naissance', type: 'text' },
      { key: 'gender', label: 'Genre', type: 'select', options: GENDER_OPTIONS },
      { key: 'relationship_status', label: 'Situation', type: 'select', options: RELATIONSHIP_OPTIONS },
    ],
  },
  {
    title: 'Localisation',
    fields: [
      { key: 'city', label: 'Ville', type: 'text' },
      { key: 'zone', label: 'Zone', type: 'select', options: ZONE_OPTIONS },
      { key: 'profession', label: 'Profession', type: 'text' },
      { key: 'sector', label: 'Secteur', type: 'text' },
      { key: 'housing_status', label: 'Logement', type: 'select', options: HOUSING_OPTIONS },
    ],
  },
  {
    title: 'Physique',
    fields: [
      { key: 'height_cm', label: 'Taille (cm)', type: 'number' },
      { key: 'skin_tone', label: 'Teint', type: 'select', options: SKIN_TONE_OPTIONS },
      { key: 'hair_length', label: 'Longueur cheveux', type: 'select', options: HAIR_LENGTH_OPTIONS },
      { key: 'hair_texture', label: 'Texture cheveux', type: 'select', options: HAIR_TEXTURE_OPTIONS },
      { key: 'hair_style', label: 'Coiffure', type: 'select', options: HAIR_STYLE_OPTIONS },
      { key: 'clothing_size', label: 'Taille vetements', type: 'select', options: CLOTHING_SIZE_OPTIONS },
      { key: 'fashion_style', label: 'Style', type: 'multiselect', options: FASHION_STYLE_OPTIONS },
    ],
  },
  {
    title: 'Lifestyle',
    fields: [
      { key: 'smoker', label: 'Fumeur', type: 'boolean' },
      { key: 'alcohol', label: 'Alcool', type: 'select', options: ALCOHOL_OPTIONS },
      { key: 'sport_frequency', label: 'Sport', type: 'select', options: SPORT_OPTIONS },
      { key: 'has_vehicle', label: 'Vehicule', type: 'boolean' },
    ],
  },
  {
    title: 'Famille',
    fields: [
      { key: 'children_has', label: 'Enfants', type: 'boolean' },
      { key: 'children_count', label: 'Nombre enfants', type: 'number' },
      { key: 'zodiac_sign', label: 'Signe', type: 'select', options: ZODIAC_OPTIONS },
      { key: 'religion', label: 'Religion', type: 'select', options: RELIGION_OPTIONS },
    ],
  },
  {
    title: 'Bio',
    fields: [
      { key: 'bio_short', label: 'Bio courte', type: 'textarea' },
      { key: 'bio_long', label: 'Bio longue', type: 'textarea' },
    ],
  },
  {
    title: 'Lover CV',
    fields: [
      { key: 'lover_cv_short', label: 'CV amoureux court', type: 'textarea' },
      { key: 'lover_cv_long', label: 'CV amoureux long', type: 'textarea' },
    ],
  },
]

// ── Fun facts field sections ──

export const FUN_FACTS_SECTIONS: FieldSection[] = [
  {
    title: 'Cuisine',
    fields: [
      { key: 'fav_dish', label: 'Plat prefere', type: 'text' },
      { key: 'sweet_pleasure', label: 'Plaisir sucre', type: 'text' },
      { key: 'dislikes_food', label: "N'aime pas", type: 'text' },
      { key: 'allergies', label: 'Allergies', type: 'text' },
      { key: 'team_environment', label: 'Team', type: 'text' },
    ],
  },
  {
    title: 'Culture',
    fields: [
      { key: 'last_book_or_alt', label: 'Dernier livre / podcast', type: 'text' },
      { key: 'movie_or_series_like_me', label: 'Film / serie qui me ressemble', type: 'text' },
      { key: 'music_of_the_moment', label: 'Musique du moment', type: 'text' },
      { key: 'ideal_weekend_activity', label: 'Weekend ideal', type: 'text' },
    ],
  },
  {
    title: 'Emotion',
    fields: [
      { key: 'best_recognized_quality', label: 'Qualite reconnue', type: 'text' },
      { key: 'small_flaw', label: 'Petit defaut', type: 'text' },
      { key: 'i_appreciate_in_someone', label: "J'apprecie chez quelqu'un", type: 'text' },
      { key: 'dealbreaker_text', label: 'Dealbreaker', type: 'text' },
    ],
  },
  {
    title: 'Histoire',
    fields: [
      { key: 'bravest_thing_done', label: 'Chose la plus courageuse', type: 'text' },
      { key: 'surprising_fact', label: 'Fait surprenant', type: 'text' },
      { key: 'happiest_when', label: 'Le plus heureux quand', type: 'text' },
    ],
  },
  {
    title: 'Projection',
    fields: [
      { key: 'i_am_looking_for', label: 'Je recherche', type: 'text' },
      { key: 'in_2_5_years_i_want', label: 'Dans 2-5 ans', type: 'text' },
      { key: 'love_language', label: "Langage d'amour", type: 'text' },
    ],
  },
]
