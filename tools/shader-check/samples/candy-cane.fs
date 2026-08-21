/*{
  "DESCRIPTION": "Candy cane stripes scrolling diagonally across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripeWidth", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.1 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float diagonal = uv.x + uv.y - TIME * speed * 0.5;
  float pattern = fract(diagonal / stripeWidth);
  float stripe = step(0.5, pattern);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, stripe);
  gl_FragColor = vec4(color, 1.0);
}
