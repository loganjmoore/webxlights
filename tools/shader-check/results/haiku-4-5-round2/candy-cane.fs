/*{
  "DESCRIPTION": "Candy cane stripes scrolling diagonally across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "stripeWidth", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.1 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float diagPos = uv.x + uv.y - TIME * speed * 0.5;
  float stripe = fract(diagPos / (stripeWidth * 2.0));
  float band = step(stripe, stripeWidth / (stripeWidth * 2.0));
  
  gl_FragColor = vec4(mix(colorA.rgb, colorB.rgb, band), 1.0);
}
