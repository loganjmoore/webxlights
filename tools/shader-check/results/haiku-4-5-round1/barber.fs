/*{
  "DESCRIPTION": "Spinning barber pole with diagonal stripes rotating continuously",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripes", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 6.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Center the coordinate system
  vec2 centered = uv - vec2(0.5, 0.5);
  
  // Create diagonal pattern that rotates
  float angle = atan(centered.y, centered.x);
  float radius = length(centered);
  
  // Diagonal stripe pattern with rotation
  float stripePattern = fract((centered.x + centered.y) * stripes + TIME * speed * 0.5);
  
  // Use a sawtooth for sharp stripes
  float band = step(0.5, stripePattern);
  
  // Mix between three colors in sequence
  vec3 col1 = mix(colorA.rgb, colorB.rgb, band);
  vec3 col2 = mix(colorB.rgb, colorC.rgb, band);
  vec3 finalColor = mix(col1, col2, sin(TIME * speed * 0.3) * 0.5 + 0.5);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
