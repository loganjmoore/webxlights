/*{
  "DESCRIPTION": "Spinning diagonal stripes like a barber pole",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripeWidth", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Rotate based on display orientation
  vec2 center = vec2(0.5, 0.5);
  vec2 offset = uv - center;
  float diagonal = offset.x + offset.y - TIME * speed * 0.5;
  
  // Create spinning stripe pattern
  float stripes = fract(diagonal / stripeWidth);
  float band = step(0.5, stripes);
  
  // Mix the two colors based on stripe pattern
  vec3 finalColor = mix(colorA.rgb, colorB.rgb, band);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
