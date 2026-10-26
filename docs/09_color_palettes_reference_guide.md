# 🎨 Guide de Référence : Palettes de Couleurs Lipidomiques & Profilage Multi-Échelles (`MT_Global_Lipidomic_Explorer`)

Ce guide recense et documente l'ensemble exhaustif des **chartes graphiques, palettes hexadécimales et échelles continues** implémentées dans l'application analytique `MT_Global_Lipidomic_Explorer_Shared_26_09_30`.

Il formalise la logique visuelle avancée développée pour l'exploration lipidomique à haute résolution :
1. **Fragmentation effective et contraste élevé** entre familles chimiques distinctes.
2. **Continuum chromatique harmonieux** au sein d'une même famille carbonée (reflétant le degré d'insaturation / doubles liaisons).
3. **Standardisation rigoureuse des échelles de heatmaps** (Z-Score global centré, row pattern scaling 0–100, grilles structurales).
4. **Sémantique fonctionnelle dédiée** pour les catégories métaboliques (FLA), les cinétiques longitudinales et les tests de contrôle qualité (QC).

---

## 🧭 1. Quelle palette choisir selon votre type de figure ?

| Type de Figure / Analyse | Nom de la Palette | Logique Visuelle & Rôle | Quand l'utiliser ? |
| :--- | :--- | :--- | :--- |
| **Barplots Horizontaux Empilés & Donut Plots** *(Composition en Acides Gras)* | **Palette Expert « Acyl Chains »** (`EXPERT_ACYL_CHAIN_PALETTES` + `EXPERT_SPECIFIC_ACYL_COLORS`) | **Double codage chromatique** :<br>• *Teinte (Hue)* = Longueur de chaîne (C2 à C27)<br>• *Luminosité / Saturation* = Nombre de doubles liaisons (0, 1, 2, ...)<br>• *Rampe ardoise neutre* = Espèces non répertoriées / VLCFA | Idéal pour profiler les **chaînes acyle sn-1 / sn-2 / N-acyle**, comparer des compositions d'acides gras entre conditions ou visualiser la fragmentation d'espèces complexes sans confusion optique. |
| **Profils Globaux & Composition par Classe** *(Stacked Bars, Pie/Donut)* | **Palette « Subclass & Hyperclass »** (`CLASS_MAP_COLORS`, `HYPERCLASS_MAP_COLORS`) | **Couleurs qualitatives franches** avec contiguïté sémantique :<br>• Phospholipides (`GP_*`) = *Camaïeux pastels / vifs contrastés*<br>• Céramides & SM = *Jaune/Doré et Brun/Gris contigus*<br>• Glycérolipides (`GL_*`) = *Or / Vert franc* | Idéal pour les vues d'ensemble de la **répartition des classes lipidiques** et l'annotation latérale des heatmaps. |
| **Heatmaps d'Abondance Globale** *(Z-Score normalisé par ligne)* | **Échelle Divergente RdBu / Okabe-Ito** (100 niveaux, centrée sur 0) | **Gradient bipolaire symétrique** :<br>• Sous-abondance / répression = *Bleu profond (`#2166AC` ou `#0072B2`)*<br>• Moyenne / neutralité = *Gris clair / Blanc (`#F7F7F7` ou `grey90`)*<br>• Sur-abondance / activation = *Rouge profond (`#B2182B` ou `#D55E00`)* | Idéal pour comparer les **déviations relatives en Z-score** de chaque lipide à travers tous les échantillons de l'atlas. |
| **Heatmaps Relatives & Profils de Motif** *(Row Pattern Scaling 0–100)* | **Échelle Séquentielle YlOrRd** (100 niveaux, de 0 à 100) | **Gradient séquentiel chaud** :<br>• Minimum = *Jaune clair (`#FFFFCC`)*<br>• Médiane = *Orange ambré (`#FD8D3C`)*<br>• Maximum = *Rouge carmin profond (`#800026`)* | Idéal pour mettre en lumière la **cinétique relative ou le pic d'expression** (0 à 100%) indépendamment de l'amplitude absolue. |
| **Grilles Structurales Carbone $\times$ Doubles Liaisons** | **Gradient Bipolaire L2FC** (`#2166AC` $\rightarrow$ `#F7F7F7` $\rightarrow$ `#B2182B`) | **Cartographie matricielle $X \times Y$** :<br>• X = Nombre total de carbones<br>• Y = Nombre total d'insaturations<br>• Remplissage = Log2 Fold Change moyen | Idéal pour identifier les **points chauds de remodelage membranaire** (élongation vs désaturation). |
| **Analyse Fonctionnelle Lipidique (FLA)** *(Radar, Barres d'indices)* | **Palette « Functional Modules »** (`fla_palette_global` & indices) | **Codage sémantique par processus biologique** :<br>• Structure = *Bleu acier (`#4E79A7`)*<br>• Signalisation = *Rouge (`#E15759`)*<br>• Énergie = *Vert (`#59A14F`)*<br>• Polarité : Positif = `#0072B2`, Négatif = `#D55E00` | Idéal pour traduire un profil lipidomique en **fonctions cellulaires** (fluidité, radeaux lipidiques, sensibilité ferroptose). |
| **Volcano Plots & Forest Plots de Remodelage** | **Palette Régulation Standard / Export** (`c_map`, `reg_colors`) | **Triptyque classique de régulation** :<br>• Up = `#E41A1C` (ou `#EF4444`)<br>• Down = `#377EB8` (ou `#3B82F6`)<br>• Non-significatif (NS) = `#AAAAAA` (ou `#94A3B8`) | Idéal pour les **tests différentiels univariés** (lipides individuels ou chaînes acyles). |

---

## 🥩 2. Palette Expert des Chaînes Acyle (Acyl Chains)

Cette palette a été spécialement conçue pour résoudre le dilemme classique de la visualisation lipidomique : **comment représenter 30 à 60 espèces d'acides gras distinctes dans un barplot horizontal sans sombrer dans une bouillie de couleurs indiscernables ?**

### 2.1 La Logique Chromatique : Continuum & Fragmentation
* **Fragmentation inter-famille (Haute discrimination) :** Chaque longueur de chaîne carbonée ($C_n$) se voit assigner un ancrage chromatique exclusif et tranché (ex. C16 = Rouge carmin, C18 = Ambre/Orange chaud, C20 = Émeraude/Cyan/Rubis, C22 = Ardoise/Indigo/Lavande).
* **Continuum intra-famille (Harmonie physiologique) :** Pour une même longueur carbonée, les degrés d'insaturation (0, 1, 2, 3...) forment une progression ordonnée en luminosité et en pureté de teinte, permettant à l'œil d'identifier immédiatement la famille tout en isolant la chaîne exacte.

---

### 2.2 Table Exhaustive des 26 Familles Carbonées (`EXPERT_ACYL_CHAIN_PALETTES`)

| Famille Carbonée | Chaîne Type | Nombre de Niveaux | Hex Codes (de Saturé à Polyinsaturé) | Nuances & Univers Visuel |
| :--- | :--- | :---: | :--- | :--- |
| **Carbone 2** | Acétate | 3 | `#0D9488`, `#14B8A6`, `#2DD4BF` | Turquoise / Vert d'eau vif |
| **Carbone 3** | Propionate | 3 | `#FB923C`, `#FDBA74`, `#FED7AA` | Pêche corail lumineux |
| **Carbone 4** | Butyrate | 3 | `#15803D`, `#16A34A`, `#4ADE80` | Vert forêt à vert pré |
| **Carbone 5** | Valérate | 3 | `#D97706`, `#F59E0B`, `#FBBF24` | Ocre ambré chaud |
| **Carbone 6** | Hexanoate | 4 | `#7E22CE`, `#9333EA`, `#C084FC`, `#E9D5FF` | Améthyste à lilas clair |
| **Carbone 7** | Heptanoate | 3 | `#C2410C`, `#EA580C`, `#FB923C` | Terre de Sienne brûlée |
| **Carbone 8** | Octanoate | 4 | `#CA8A04`, `#EAB308`, `#FDE047`, `#FEF08A` | Jaune or / Moutarde vive |
| **Carbone 9** | Pélargonate | 3 | `#9A3412`, `#C2410C`, `#EA580C` | Terracotta bronze |
| **Carbone 10** | Décananoate | 4 | `#115E59`, `#14B8A6`, `#5EEAD4`, `#99F6E4` | Teal pin à menthe aquatique |
| **Carbone 11** | Undécanoate | 3 | `#881337`, `#BE123C`, `#FB7185` | Baie sauvage / Rose rubis |
| **Carbone 12** | Laurate | 4 | `#1E40AF`, `#2563EB`, `#60A5FA`, `#BAE6FD` | Bleu cobalt royal à glacier |
| **Carbone 13** | Tridécanoate | 3 | `#4D7C0F`, `#65A30D`, `#84CC16` | Olive mousse à vert anis |
| **Carbone 14** | Myristate | 4 | `#1E3A8A`, `#2563EB`, `#60A5FA`, `#93C5FD` | Bleu marine profond à azur |
| **Carbone 15** | Pentadécanoate | 4 | `#7C3AED`, `#8B5CF6`, `#A78BFA`, `#C4B5FD` | Violet royal à lavande |
| **Carbone 16** | Palmitate | 6 | `#B91C1C`, `#F87171`, `#DC2626`, `#EF4444`, `#FCA5A5`, `#FECACA` | **Cramoisi sanguin à rouge corail** |
| **Carbone 17** | Heptadécanoate | 4 | `#C2410C`, `#EA580C`, `#FB923C`, `#FDBA74` | Rouille cuivrée à saumon |
| **Carbone 18** | Stéarate / Oléate | 6 | `#B45309`, `#F97316`, `#FBBF24`, `#FEF08A`, `#F59E0B`, `#FDE68A` | **Brun ambré, mandarine, beurre doré** |
| **Carbone 19** | Nonadécanoate | 6 | `#65A30D`, `#84CC16`, `#A3E635`, `#D9F99D`, `#4D7C0F`, `#365314` | Vert chartreuse à vert olive foncé |
| **Carbone 20** | Arachidonate / EPA | 7 | `#047857`, `#06B6D4`, `#0F766E`, `#A5F3FC`, `#BE185D`, `#FB7185`, `#F43F5E` | **Émeraude, cyan, teal, rubis, rose fuchsia** |
| **Carbone 21** | Hénéicosanoate | 6 | `#0F766E`, `#14B8A6`, `#2DD4BF`, `#0D9488`, `#115E59`, `#134E4A` | Teal profond à aigue-marine |
| **Carbone 22** | Béhénate / DHA | 8 | `#475569`, `#64748B`, `#4338CA`, `#3730A3`, `#1E1B4B`, `#6366F1`, `#C7D2FE`, `#E0E7FF` | **Ardoise acier, indigo profond, pervenche** |
| **Carbone 23** | Tricosanoate | 7 | `#701A75`, `#86198F`, `#A21CAF`, `#C026D3`, `#D946EF`, `#E879F9`, `#F0ABFC` | Prune lie-de-vin à rose orchidée |
| **Carbone 24** | Lignocérique | 7 | `#334155`, `#0284C7`, `#0E7490`, `#0369A1`, `#2563EB`, `#6D28D9`, `#C026D3` | **Gris ardoise, bleu océan, violet, fuchsia** |
| **Carbone 25** | Pentacosanoate | 7 | `#312E81`, `#4338CA`, `#4F46E5`, `#6366F1`, `#818CF8`, `#A5B4FC`, `#C7D2FE` | Mauve indigo nuit à lavande douce |
| **Carbone 26** | Cérébronique / VLCFA | 8 | `#581C87`, `#D946EF`, `#A21CAF`, `#C026D3`, `#E879F9`, `#F472B6`, `#FB7185`, `#FDA4AF` | Mûre noire, magenta électrique, rose poudré |
| **Carbone 27** | Dérivés Stéroliques | 3 | `#78350F`, `#92400E`, `#B45309` | Brun tabac à ocre chaud |

---

### 2.3 Répertoire des 63 Espèces Acyles Spécifiques (`EXPERT_SPECIFIC_ACYL_COLORS`)

Lorsqu'une chaîne exacte est identifiée, le moteur lui attribue directement son code hexadécimal fixe :

```r
# --- Chaînes Courtes & Moyennes (SCFA & MCFA) ---
"2:0"  = "#0D9488"   # Acétate
"3:0"  = "#FB923C"   # Propionate
"4:0"  = "#15803D"   # Butyrate
"5:0"  = "#D97706"   # Valérate
"6:0"  = "#7E22CE"   # Caproate
"6:1"  = "#9333EA"
"6:2"  = "#C084FC"
"7:0"  = "#C2410C"
"8:0"  = "#CA8A04"   # Caprylate
"8:1"  = "#EAB308"
"8:2"  = "#FDE047"
"9:0"  = "#9A3412"
"9:1"  = "#EA580C"
"10:0" = "#115E59"   # Caprate
"10:1" = "#14B8A6"
"10:2" = "#5EEAD4"
"11:0" = "#881337"
"11:1" = "#BE123C"
"12:0" = "#1E40AF"   # Laurate
"12:1" = "#2563EB"
"12:2" = "#60A5FA"
"13:0" = "#4D7C0F"
"13:1" = "#65A30D"

# --- Chaînes Longues (LCFA) ---
"14:0" = "#1E3A8A"   # Myristate
"14:1" = "#2563EB"   # Myristoléate
"15:0" = "#7C3AED"
"15:1" = "#8B5CF6"
"16:0" = "#B91C1C"   # Palmitate (Saturé majeur - Rouge brique)
"16:1" = "#F87171"   # Palmitoléate (MUFA - Corail clair)
"16:2" = "#DC2626"
"17:0" = "#C2410C"
"17:1" = "#EA580C"
"17:2" = "#FB923C"
"18:0" = "#B45309"   # Stéarate (Saturé majeur - Ambre foncé)
"18:1" = "#F97316"   # Oléate (MUFA majeur - Orange vif)
"18:2" = "#FBBF24"   # Linoléate (Omega-6 essentiel - Jaune chaud)
"18:3" = "#FEF08A"   # Linolénate (Omega-3 essentiel - Crème douce)
"18:4" = "#F59E0B"   # Stéaridonique
"19:0" = "#65A30D"
"19:1" = "#84CC16"
"20:0" = "#047857"   # Arachidate (Vert émeraude)
"20:1" = "#06B6D4"   # Gondoate (Cyan vif)
"20:2" = "#0F766E"   # Éicosadiénoate (Teal profond)
"20:3" = "#A5F3FC"   # DGLA (Glace cyan)
"20:4" = "#BE185D"   # Arachidonate / AA (Médiateur clé - Rose rubis)
"20:5" = "#FB7185"   # EPA (Omega-3 anti-inflammatoire - Rose saumon)
"20:6" = "#F43F5E"   # Rose framboise
"21:0" = "#0F766E"
"22:0" = "#475569"   # Béhénate (Gris ardoise)
"22:1" = "#64748B"   # Érucate (Ardoise moyen)
"22:2" = "#4338CA"   # Indigo
"22:4" = "#1E1B4B"   # Adrénique (Bleu nuit très dense)
"22:5" = "#6366F1"   # DPA (Iris électrique)
"22:6" = "#C7D2FE"   # DHA (Omega-3 majeur - Pervenche clair)
"23:0" = "#701A75"
"23:1" = "#86198F"
"24:0" = "#334155"   # Lignocérate (Ardoise charbon)
"24:1" = "#0284C7"   # Nervonate (Bleu azur)
"24:2" = "#0E7490"
"24:4" = "#2563EB"
"24:5" = "#6D28D9"
"24:6" = "#C026D3"
"25:0" = "#312E81"

# --- Chaînes Très Longues (VLCFA - Sphingolipides) ---
"26:0" = "#581C87"   # Cérotique (Violet sombre)
"26:1" = "#D946EF"   # Magenta électrique
"26:2" = "#A21CAF"
"27:0" = "#78350F"   # Brun terre
"Other" = "#94A3B8"  # Slate 400
```

### 2.4 Rampe Ardoise Neutre & Fallbacks (Formes Sommes & Non-Assignés)
Pour les compositions d'espèces globales non fragmentées ($>24$ carbones) ou les lipides complexes sans position sn résolue, une rampe ardoise anti-saturation visuelle évite l'éblouissement néon :
* **Rampe Harmonique Ardoise :** `c("#475569", "#64748B", "#94A3B8", "#CBD5E1", "#334155", "#1E293B")`
* **Espèces Unassigned / Spotted :** `#757575` *(Gris neutre moyen)*
* **Chaîne non-parsable :** `#9E9E9E`

---

## 🧬 3. Palettes des Classes & Hyperclasses Lipidiques

### 3.1 Sous-Classes Lipidiques (`CLASS_MAP_COLORS`)
26 sous-classes couvrant les principales familles de lipides membranaires et de réserve. Les dérivés éther/plasmalogène et dihydro sont regroupés en **camaïeux contigus** pour maintenir la parenté biochimique.

| Famille Générale | Sous-Classe | Hex Code | Couleur Visuelle | Rôle & Particularité |
| :--- | :--- | :---: | :--- | :--- |
| **Phospholipides (GP)** | `GP_PC` | `#B07AA1` | Mauve orchidée | Phosphatidylcholine (lipide structural majeur) |
| | `GP_LPC` | `#E15759` | Rouge corail | Lysophosphatidylcholine |
| | `GP_PE` | `#FF9DA7` | Rose pastel | Phosphatidyléthanolamine diacylée |
| | `GP_PE_E` | `#9C755F` | Brun châtaigne | Éther-PE (Alkyl-éther) |
| | `GP_PE_P` | `#BAB0AC` | Gris perle rosé | **Plasmalogène PE (Vinyl-éther antioxydant)** |
| | `GP_LPE` | `#F28E2B` | Orange vif | Lysophosphatidyléthanolamine |
| | `GP_PI` | `#D37295` | Rose violacé | Phosphatidylinositol (signalisation) |
| | `GP_LPI` | `#59A14F` | Vert feuille | Lysophosphatidylinositol |
| | `GP_PS` | `#8CD17D` | Vert tendre | Phosphatidylsérine (feuillet interne / apoptose) |
| | `GP_LPS` | `#A07AA1` | Mauve lavande | Lysophosphatidylsérine |
| | `GP_PG` | `#86BCB6` | Vert d'eau doux | Phosphatidylglycérol |
| | `GP_LPG` | `#76B7B2` | Sarcelle pâle | Lysophosphatidylglycérol |
| | `GP_PA` | `#EDC948` | Jaune soleil | Acide phosphatidique |
| | `GP_LPA` | `#A0CBE8` | Bleu layette | Lysophosphatidate |
| | `GP_CL` | `#E28E2B` | Ambre orangé | Cardiolipine (signature mitochondriale) |
| **Sphingolipides (SP)** | `SP_Cer` | `#EDC948` | Jaune or | Céramide (hub métabolique) |
| | `SP_Cer_dh` | `#B6992D` | Ocre vieil or | Dihydro-céramide |
| | `SP_SM` | `#9C755F` | Brun terreux | Sphingomyéline (radeaux lipidiques) |
| | `SP_SM_dh` | `#79706E` | Taupe foncé | Dihydro-sphingomyéline |
| | `SP_GlcCer` | `#5C4F3D` | Brun sépia foncé | Glucosyl-céramide |
| | `SP_LacCer` | `#499894` | Teal ardoisé | Lactosyl-céramide |
| **Glycérolipides (GL)** | `GL_DAG` | `#FFC300` | Jaune safran | Diacylglycérol (second messager PKC) |
| | `GL_TAG` | `#2ECC71` | Vert émeraude franc | Triacylglycérol (gouttelettes de stockage neutre) |
| **Acides Gras & Stérols** | `FA_ACar` | `#4E79A7` | Bleu ardoise | Acyl-carnitines (navette $\beta$-oxydation) |
| | `ST_CE` | `#C7C7C7` | Gris argent | Cholestéryl-esters |
| **Divers** | `Misc` | `#B0B0B0` | Gris moyen | Non-classifiés |

---

### 3.2 Hyperclasses & Médiateurs Régulateurs (`HYPERCLASS_MAP_COLORS`)

```r
HYPERCLASS_MAP_COLORS <- c(
  "GP"   = "#4E79A7",  # Glycerophospholipids (Bleu ardoise)
  "FA"   = "#59A14F",  # Fatty Acyls (Vert feuille)
  "ST"   = "#9C755F",  # Sterols (Brun terreux)
  "SP"   = "#B07AA1",  # Sphingolipids (Mauve orchidée)
  "GL"   = "#F1C40F",  # Glycerolipids (Or lumineux)
  "Misc" = "#B0B0B0",  # Divers (Gris neutre)
  
  # --- Polyinsaturés Régulateurs Clés ---
  "AA"   = "#E15759",  # Arachidonic Acid 20:4 (Rouge corail pro-inflammatoire)
  "EPA"  = "#76B7B2",  # Eicosapentaenoic Acid 20:5 (Sarcelle doux)
  "DHA"  = "#EDC948",  # Docosahexaenoic Acid 22:6 (Jaune or)
  "DPA"  = "#F28E2B"   # Docosapentaenoic Acid 22:5 (Orange ambré)
)
```

---

### 3.3 Groupes Cliniques & Expérimentaux (Homéostasie vs Crise Vaso-Occlusive)
Dictionnaires prioritaires d'écrasement pour les échantillons témoins et pathologiques :
* **Contrôle / Homéostasie :** `CCSteadyState1_Control` = `#BDBDBD` *(Gris neutre 400)*
* **État Stable 1 :** `SteadyState1_Exp` = `#9ECAE1` *(Bleu ciel clair)*
* **État Stable 2 :** `SteadyState2_Exp` = `#3182BD` *(Bleu royal)*
* **Crise Aiguë 1 :** `PainCrisis1_Exp` = `#FB6A4A` *(Orange corail vif)*
* **Crise Aiguë 2 :** `PainCrisis2_Exp` = `#CB181D` *(Rouge carmin profond)*

---

## 🌡️ 4. Échelles Continues & Z-Score Heatmaps

L'architecture du moteur `generateHeatmapObject` et de `pheatmap` repose sur deux modes d'échelles selon que les données sont relatives ou standardisées.

### 4.1 Z-Score Global Normalisé (Mode Divergent Symétrique)
Appliqué aux matrices $\log_2(\text{Intensité})$ standardisées par ligne ($Z = \frac{x - \mu}{\sigma}$), tronqué symétriquement entre $-\text{limit}$ et $+\text{limit}$ (typiquement $\pm 2$ à $\pm 4$).

* **Palette Standard RdBu (Inversée, 101 coupures, 100 couleurs) :**
  * `Bas (-Z)` : `#2166AC` *(Bleu profond)*
  * `Centre (0)` : `#F7F7F7` *(Gris-blanc neutre)*
  * `Haut (+Z)` : `#B2182B` *(Rouge rubis sombre)*
* **Variante Okabe-Ito (Accessibilité Daltonisme / Fine-Tuning) :**
  * `Bas (-Z)` : `#0072B2` *(Bleu de cobalt)*
  * `Centre (0)` : `grey90` / `#E5E7EB` *(Gris doux)*
  * `Haut (+Z)` : `#D55E00` *(Vermillon vif)*
* **Variante Export Studio :**
  * `Bas (-Z)` : `#2563EB` *(Bleu Tailwind 600)*
  * `Centre (0)` : `#FFFFFF` *(Blanc pur)*
  * `Haut (+Z)` : `#EF4444` *(Rouge Tailwind 500)*
* **Valeurs Manquantes / Imputées :** `grey80` (`#CCCCCC`)
* **Lisibilité Numérique :** Police blanche dynamique dès que $|Z| \ge 0.6 \times \text{palette\_limit}$, noire sinon.

---

### 4.2 Pattern Z-Score & Échelle Relative (Mode Séquentiel 0 à 100)
Appliqué lorsque l'utilisateur s'intéresse à la forme du profil d'abondance d'un lipide à travers les colonnes (mise à l'échelle min-max 0–100%).

* **Palette Séquentielle Standard (`YlOrRd`, 9 couleurs interpolées en 100 niveaux) :**
  * `0% (Minimum)` : `#FFFFCC` *(Jaune crème pâle)*
  * `50% (Médiane)` : `#FD8D3C` *(Orange mandarine)*
  * `100% (Maximum)` : `#800026` *(Bordeaux lie-de-vin)*
* **Lisibilité Numérique :** Police blanche dès que la valeur relative excède $60\%$.

---

### 4.3 Grilles Structurales & Voies Métaboliques
* **Cartes Structurales Carbone $\times$ Doubles Liaisons (`12_structural_grid_module.R`) :**
  * Gradient continu centré sur $0$ pour le $\text{Log}_2\text{FC}$ moyen :
    $$\text{Bas } (-3) = \text{\#2166AC} \quad\longleftrightarrow\quad \text{Médiane } (0) = \text{\#F7F7F7} \quad\longleftrightarrow\quad \text{Haut } (+3) = \text{\#B2182B}$$
* **Nœuds du Réseau Métabolique Lipidique (`13_pathway_module.R`) :**
  * *Décalage de désaturation (Sat Z-Score)* : Échelle divergente Plotly `[0, "#1F77B4"]`, `[0.5, "#F7F7F7"]`, `[1.0, "#D62728"]`
  * *Longueur de chaîne carbonée* : Échelle séquentielle `viridisLite::plasma(100)`

---

## ⚡ 5. Palettes d'Analyse Fonctionnelle Lipidique (FLA)

Le module FLA (`10_fla_module.R`) regroupe les lipides en signatures fonctionnelles cellulaires et calcule des indices biophysiques prédictifs (fluidité membranaire, résistance à la ferroptose, vulnérabilité à la peroxydation).

### 5.1 Macro-Fonctions Énergético-Structurales
* **Structural :** `#4E79A7` *(Bleu acier classique)*
* **Signaling :** `#E15759` *(Rouge corail)*
* **Energy :** `#59A14F` *(Vert feuillu)*

---

### 5.2 Les 11 Modules Fonctionnels / Thèmes Détaillés (`fla_palette_global`)

| Module Fonctionnel / Thème | Hex Global | Hex Détaillé | Signification Biophysique |
| :--- | :---: | :---: | :--- |
| **Membrane Architecture** | `#1F4E79` | `#4E79A7` | Organisation bicouche, intégrité physique (`PC`, `PE`, `PI`) |
| **Lipid Raft Dynamics** | `#2B7A78` | `#76B7B2` | Condensation des microdomaines membranaires (`SM`, `Cholestérol`) |
| **Apoptosis & Ferroptosis** | `#D7191C` | `#E15759` | Sensibilité au stress oxydant, lipoperoxydation (`PUFA`, `PS`) |
| **Mitochondrial Homeostasis** | `#E66100` | `#F28E2B` | Intégrité des crêtes et chaîne respiratoire (`Cardiolipines`) |
| **Epigenetic Remodeling** | `#7B3294` | `#B07AA1` | Navette métabolique nucléaire, acétylation (`Acides Gras Courts/Moyens`) |
| **Vesicular Trafficking** | `#8C510A` | `#9C755F` | Bourgeonnement, endocytose et fusion membranaire (`DAG`, `PA`) |
| **Secondary Signaling Messengers** | `#D01C8B` | `#FF9D9A` | Voies de signalisation lipidique intra-cellulaire (`DAG`, `IP3/PIP`) |
| **Lysosomal Hydrolysis & Eicosanoids** | `#CA0020` | `#D37295` | Dégradation acide et médiateurs bioactifs de résolution |
| **Lipid Droplet Maturation** | `#1A9850` | `#59A14F` | Biogenèse et stockage des triglycérides neutres (`TAG`) |
| **Lipolytic Clearance** | `#008837` | `#8CD17D` | Mobilisation enzymatique des lipides de réserve |
| **Other / Non-spécifié** | `#404040` | `#6C757D` | Contenu de fond ou témoins |

---

### 5.3 Polarité des Indices Fonctionnels (Directionnalité)
Pour les barres d'enrichissement d'indices FLA (ex. *Membrane Fluidity Index*, *Plasmalogen Antioxidant Shielding*, *Cardiolipin Fraction*) :
* **Indice Favorable / Positif (+) :** `#0072B2` *(Bleu ciel Okabe-Ito)*
* **Indice Défavorable / Négatif (-) :** `#D55E00` *(Vermillon Okabe-Ito)*

---

## 📈 6. Trajectoires Longitudinales, Différentiel & Contrôle Qualité

### 6.1 Tests Différentiels Univariés (Volcano Plots & Forest Plots)
* **Standard Volcano (`6_volcano_module.R`) :**
  * `Up (Significatif haut)` : `#E41A1C` *(Rouge Set1)*
  * `Down (Significatif bas)` : `#377EB8` *(Bleu Set1)*
  * `NS (Non significatif)` : `#AAAAAA` *(Gris moyen neutre)*
* **Export Studio Volcano (`99_export_studio_module.R`) :**
  * `Up` : `#EF4444` *(Tailwind Red-500)*
  * `Down` : `#3B82F6` *(Tailwind Blue-500)*
  * `NS` : `#94A3B8` *(Tailwind Slate-400)*
* **Violins de Paramètres Structuraux (Ref vs Comp) :**
  * `Enriched in Ref` : `#0072B2` *(Bleu)*
  * `Enriched in Comp` : `#D55E00` *(Orange)*

---

### 6.2 Séries Temporelles & Trajectoires Longitudinales (`11_longitudinal_module.R`)
* **Cohortes Temporelles de Base (8 groupes) :**
  `c("#9ECAE1", "#3182BD", "#FB6A4A", "#CB181D", "#A6D854", "#FFD92F", "#E78AC3", "#B3B3B3")`
* **Direction des Trajectoires :**
  * `Up` : `#FC4E2A` *(Orange rouge vif)*
  * `Down` : `#1D91C0` *(Bleu océan)*
  * `No Change` : `#969696` *(Gris neutre)*

---

### 6.3 Contrôle Qualité & Statut des Échantillons (`2_qc_boxplot_module.R`)
* **Détection des Outliers (Z-score de distance MAD) :**
  * `Normal (Conforme)` : `#4E79A7` *(Bleu ardoise)*
  * `Outlier Risk / High Deviation` : `#E15759` *(Rouge alerte)*
* **Badges et Tables Qualité :**
  * `Pass` : Texte `#155724` sur fond `#D4EDDA` *(Vert succès)*
  * `Fail` : Texte `#721C24` sur fond `#F8D7DA` *(Rouge critique)*
  * `Imputed (MNAR)` : Texte `#E65100` sur fond `#FFF3E0` *(Orange ambré)*
  * `Observed` : Texte `#2E7D32` sur fond `#E8F5E9` *(Vert émeraude)*

---

## 🖥️ 7. Tokens de Design Système UI (`custom.css`)

Ces variables CSS régissent les cartes de contrôle, tooltips et bannières de l'interface utilisateur de l'application :

```css
:root {
  /* Marqueurs Thématiques */
  --bio-teal:                #0f766e;  /* Sarcelle profonde */
  --bio-teal-tint:           rgba(15, 118, 110, 0.05);
  --bio-teal-border:         rgba(15, 118, 110, 0.22);
  --orchid-mauve:            #7c3aed;  /* Violet royal / Orchidée */
  --orchid-mauve-tint:       rgba(124, 58, 237, 0.04);
  --amber-ochre:             #d97706;  /* Ambre ocre / Avertissements */
  --amber-ochre-tint:        rgba(217, 119, 6, 0.05);

  /* Neutres Typographiques & Ardoises */
  --neutral-slate-dark:      #334155;  /* Titres et textes gras */
  --neutral-slate-text:      #1e293b;  /* Corps de texte principal */
  --neutral-slate-muted:     #64748b;  /* Sous-titres et métadonnées */
  --neutral-slate-border:    #e2e8f0;  /* Lignes de séparation */
  --neutral-slate-bg:        #f8fafc;  /* Fonds d'encarts & cartes */

  /* Actions Primaires */
  --action-primary:          #1d4ed8;  /* Bleu d'action (boutons, onglets actifs) */
  --action-primary-hover:    #1e40af;
  --action-primary-tint:     rgba(29, 78, 216, 0.08);
}
```

---

## 🔗 8. Traçabilité SSoT & Références des Fichiers Sources

Toutes les palettes de ce guide sont directement issues des modules exécutables suivants :

* **Utilitaires Couleurs & Chaînes Acyle :** [R/utils_colors.R](file:///Users/mmt02/Library/CloudStorage/GoogleDrive-mtricaud.cetri@gmail.com/My%20Drive/ULaval_Research_Hub/2026_From_Yale/2026_Lipidomic_App/Only_Global/MT_Global_Lipidomic_Explorer_Shared_26_09_30/R/utils_colors.R#L5-L328)
* **Générateur Heatmaps & Barplots :** [R/utils_vis.R](file:///Users/mmt02/Library/CloudStorage/GoogleDrive-mtricaud.cetri@gmail.com/My%20Drive/ULaval_Research_Hub/2026_From_Yale/2026_Lipidomic_App/Only_Global/MT_Global_Lipidomic_Explorer_Shared_26_09_30/R/utils_vis.R#L285-L1000)
* **Visualisations Structurales & Barplots Horizontaux :** [R/modules/8_structural_module.R](file:///Users/mmt02/Library/CloudStorage/GoogleDrive-mtricaud.cetri@gmail.com/My%20Drive/ULaval_Research_Hub/2026_From_Yale/2026_Lipidomic_App/Only_Global/MT_Global_Lipidomic_Explorer_Shared_26_09_30/R/modules/8_structural_module.R#L4700-L6060)
* **Analyse Fonctionnelle Lipidique (FLA) :** [R/modules/10_fla_module.R](file:///Users/mmt02/Library/CloudStorage/GoogleDrive-mtricaud.cetri@gmail.com/My%20Drive/ULaval_Research_Hub/2026_From_Yale/2026_Lipidomic_App/Only_Global/MT_Global_Lipidomic_Explorer_Shared_26_09_30/R/modules/10_fla_module.R#L20-L50)
* **Grilles Structurales Carbone $\times$ Doubles Liaisons :** [R/modules/12_structural_grid_module.R](file:///Users/mmt02/Library/CloudStorage/GoogleDrive-mtricaud.cetri@gmail.com/My%20Drive/ULaval_Research_Hub/2026_From_Yale/2026_Lipidomic_App/Only_Global/MT_Global_Lipidomic_Explorer_Shared_26_09_30/R/modules/12_structural_grid_module.R#L160-L240)
* **Trajectoires Longitudinales :** [R/modules/11_longitudinal_module.R](file:///Users/mmt02/Library/CloudStorage/GoogleDrive-mtricaud.cetri@gmail.com/My%20Drive/ULaval_Research_Hub/2026_From_Yale/2026_Lipidomic_App/Only_Global/MT_Global_Lipidomic_Explorer_Shared_26_09_30/R/modules/11_longitudinal_module.R#L30-L70)
* **Feuille de Style & Tokens CSS :** [www/css/custom.css](file:///Users/mmt02/Library/CloudStorage/GoogleDrive-mtricaud.cetri@gmail.com/My%20Drive/ULaval_Research_Hub/2026_From_Yale/2026_Lipidomic_App/Only_Global/MT_Global_Lipidomic_Explorer_Shared_26_09_30/www/css/custom.css#L1-L40)
