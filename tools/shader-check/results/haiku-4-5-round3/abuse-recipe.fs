/*{
  "DESCRIPTION": "Scrolling chocolate and vanilla stripes with chip sparkles",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorChocolate", "TYPE": "color", "DEFAULT": [0.4, 0.2, 0.0, 1.0] },
    { "NAME": "colorVanilla", "TYPE": "color", "DEFAULT": [0.95, 0.9, 0.8, 1.0] },
    { "NAME": "colorChip", "TYPE": "color", "DEFAULT": [0.2, 0.1, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "chipDensity", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float scroll = fract(uv.x - TIME * speed * 0.25);
  float stripe = step(fract(scroll * 4.0), 0.5);
  
  vec3 baseColor = mix(colorVanilla.rgb, colorChocolate.rgb, stripe);
  
  float chipSeed = sin(uv.x * 12.0 + uv.y * 8.0 + TIME * 0.5);
  float chipNoise = fract(chipSeed * 43758.5453);
  float chip = step(1.0 - chipDensity * 0.3, chipNoise);
  
  vec3 finalColor = mix(baseColor, colorChip.rgb, chip * 0.8);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
