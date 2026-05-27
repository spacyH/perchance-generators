# Perchance Cat Coat Predictor Generator

Goal:
Demo domestic cat coat inheritance using a Perchance generator.

Features:

1. Enter Parent A coat values
2. Optional Parent B coat values
3. Enter kitten count + genders
4. Predict kitten coat probabilities
5. Reverse inference mode:
   Input kitten outcomes
   Infer likely Parent B coat values

Top Editor (DSL) simple mock-up, tabby example (Note: Maybe extend to other coat colors, styles, lengths, types, eye color, etc.? Full genetic probability suit?):

```
coat_black
  black

coat_orange
  orange

coat_tortie
  tortie

white
  none
  low
  medium
  high

pattern
  solid
  mackerel
  classic
  spotted
  ticked

dilute
  no
  yes

sex
  male
  female

cat
  sex=[sex]
  base=[coat_black|coat_orange|coat_tortie]
  white=[white]
  pattern=[pattern]
  dilute=[dilute]

predictOffspring(parentA,parentB,kittenSex)

  // Orange locus

  if(parentA.base=="tortie" && kittenSex=="male")
    black:50
    orange:50

  if(parentA.base=="tortie" && kittenSex=="female")
    tortie:50
    orange:50

  if(parentA.base=="orange" && parentB.base=="black")

    if(kittenSex=="male")
      orange:50
      black:50

    if(kittenSex=="female")
      tortie:100

reverseInference(kittens)

  score_black=0
  score_orange=0
  score_tortie=0

  if(kittens contains "tortie")
    score_black += 1
    score_orange += 1

  if(kittens contains "orange male")
    score_orange += 2

  if(kittens contains "black male")
    score_black += 2

  highestScore
```

HTML Panel:

```
Parent A

<select id="aBase">
<option>black</option>
<option>orange</option>
<option>tortie</option>
</select>

Parent B

<select id="bBase">
<option>unknown</option>
<option>black</option>
<option>orange</option>
<option>tortie</option>
</select>

Kitten Count

<input id="count" value="4">

<button onclick="runPredict()">
Predict
</button>

<button onclick="runInfer()">
Infer Parent
</button>

<div id="results"></div>

<script>

function runPredict(){

 let parentA={
   base:aBase.value
 };

 let parentB={
   base:bBase.value
 };

 let output=[];

 for(let i=0;i<count.value;i++){

   let sex=Math.random()<0.5?
   "male":
   "female";

   output.push(
     root.predictOffspring(
       parentA,
       parentB,
       sex
     )
   );

 }

 results.innerText=
 JSON.stringify(output,null,2);

}

function runInfer(){

 /*
 Reverse solve:

 kittens:
 orange male
 black male
 tortie female

 infer:

 likely unknown parent:
 black or orange

 confidence:
 85%

 */

}

</script>
```

Game mechanic:

Known parent nodes narrow offspring graph.

Known kitten genders narrow graph further.

Observed offspring outcomes increase confidence scoring for hidden parent inference.

Model:

Known Parent
+
Known Kitten Sex
+
Observed Coat Outcomes

=

Probability Traversal

Reverse Mode:

Observed Kittens

-> score reachable parent nodes

-> rank parent candidates

Inspired by:
- Sphere grid progression systems
- Dependency graphs
- Layered genetics systems

