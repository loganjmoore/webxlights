/*{
  "DESCRIPTION": "Candy cane stripes scrolling diagonally across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripeWidth", "TYPE": "float", "MIN": 0.02, "MAX": 0.3, "DEFAULT": 0.1 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float diagonal = uv.x + uv.y - TIME * speed * 0.5;
  float stripe = fract(diagonal / stripeWidth);
  float band = step(0.5, stripe);
  
  vec3 finalColor = mix(colorA.rgb, colorB.rgb, band);
  gl_FragColor = vec4(finalColor, 1.0);
}
