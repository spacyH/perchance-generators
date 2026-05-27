# Domestic Cat Coat Genetics as a Network Graph
Source image inspiration: http://messybeast.com/tricolours.htm

## Abstract

This document analyzes domestic cat coat genetics as a layered network rather than a simple family tree. Starting from tortoiseshell inheritance charts, we can model domestic cat coat appearance as a mesh graph composed of pigment nodes, pattern nodes, and modifier nodes.

The original tortoiseshell chart demonstrates that cat coat inheritance behaves more like interacting systems than linear inheritance.

---

## Layer 1: Base Pigment System

Domestic cats primarily derive visible coloration from two pigment families:

- Eumelanin
  - Black
  - Chocolate
  - Cinnamon
  - Dilute forms:
    - Blue (gray)
    - Lilac
    - Fawn

- Pheomelanin
  - Orange / Red
  - Cream (dilute orange)

The Orange locus is sex-linked on the X chromosome.

Female:
- O/O → orange
- o/o → black-family
- O/o → tortoiseshell

Male:
- O/Y → orange
- o/Y → black-family

Tortoiseshell emerges as a hybrid routing node because X-inactivation creates spatial orange and non-orange expression.

References:
- MessyBeast tricolour overview
- Eizirik et al. domestic cat X chromosome mapping
- Domestic cat Orange locus mapping papers

---

## Layer 2: Pattern Engine

Pattern behaves semi-independently from pigment.

Major domestic categories:

### Solid

No visible tabby expression.

Examples:
- Black
- Blue
- Chocolate
- Cream

### Tabby Family

Research demonstrates tabby patterns are not a single switch.

Primary macro-groups:

- Mackerel tabby
  - vertical striping

- Classic / blotched tabby
  - swirls

- Spotted tabby
  - spots derived partly through stripe modification

- Ticked tabby
  - reduced body striping

Network view:

Mackerel
    |
Spotted

Classic

Ticked

Research suggests spotting is not entirely separate from striping; modifying stripe developmental pathways can generate spotted phenotypes.

---

## Layer 3: White Overlay

White is best understood as pigment absence.

Categories:

- Locket
- Tuxedo
- Bicolor
- Harlequin
- Van

White spotting acts more like a masking layer.

Network:

Black
 +
White spotting
 =
Tuxedo

Tortie
 +
White spotting
 =
Calico

Embryonic melanocyte migration influences white distribution.

---

## Layer 4: Dilution Layer

Dense pigment
    |
Dilution
    |

Black -> Blue

Chocolate -> Lilac

Cinnamon -> Fawn

Orange -> Cream

Dilution functions almost like a shader modifier applied after pigment generation.

---

## Layer 5: Silver / Smoke

Additional inhibitor systems alter pigment deposition.

Black
 |
Smoke
 |
Silver Tabby

This behaves like a post-processing layer.

---

## Layer 6: Point Restriction

Temperature-sensitive pigmentation.

Examples:

- Seal point
- Blue point
- Flame point
- Cream point

Cooler body areas express darker pigmentation.

---

## Network Model

Domestic cat coat appearance resembles:

Base Pigment
      |
Pattern Engine
      |
Dilution
      |
White Overlay
      |
Special Modifiers
      |
Final Phenotype

Example:

Black
 +
Tabby
 +
White
 =
Black Tabby + White

Orange
 +
Dilution
 +
Point
 =
Cream Point

Black
 +
Orange
 =
Tortie

Tortie
 +
White
 =
Calico

---

## Meta-analysis

The original tortoiseshell chart highlights an important property:

Pure-color nodes have relatively low branching.

Hybrid nodes expand possibility space.

Tortoiseshell functions as a high-connectivity network hub.

Calico becomes a second-order hub.

Domestic cat coat genetics therefore resembles:

- skill tree
- dependency graph
- procedural generation pipeline
- mesh network

More than a simple pedigree.

---

## Macro-biomes of Domestic Cat Appearance

1. Solids
2. Tabbies
3. Torties / Calicos
4. White spotting coats
5. Pointed coats
6. Silver / Smoke coats
7. Dilutes

These seven clusters cover most major domestic house-cat visual categories without descending into breed-specific edge cases.

---

## References

MessyBeast:
http://messybeast.com/tricolours.htm

Eizirik E. et al.
"Defining and Mapping Mammalian Coat Pattern Genes"
Genetics (2010)

Lomax TD, Robinson R.
"Tabby Pattern Alleles of the Domestic Cat"
Journal of Heredity (1988)

Lyons LA et al.
"The Tabby Cat Locus Maps to Feline Chromosome B1"

Domestic cat X chromosome Orange locus mapping research.

Genetic testing in domestic cats review literature.
