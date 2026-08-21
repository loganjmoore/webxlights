/*{
  "DESCRIPTION": "A rotating diagonal stripe barber pole effect",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "stripeWidth", "TYPE": "float", "MIN": 0.02, "MAX": 0.5, "DEFAULT": 0.15 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Center coordinates
  vec2 center = vec2(0.5, 0.5);
  vec2 p = uv - center;
  
  // Convert to angle and distance
  float angle = atan(p.y, p.x);
  float dist = length(p);
  
  // Create diagonal stripes that rotate
  float stripe = fract((angle / 3.14159265 + dist / stripeWidth + TIME * speed * 0.5) * 0.5);
  
  // Sharpen the stripe transition
  float band = step(0.5, stripe);
  
  // Mix colors based on stripe
  vec3 color = mix(colorA.rgb, colorB.rgb, band);
  
  gl_FragColor = vec4(color, 1.0);
}
