/*{
  "DESCRIPTION": "Swirling plasma effect with animated color waves",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Center and scale coordinates
  vec2 pos = (uv - 0.5) * scale;
  
  // Swirling motion using angle and radius
  float angle = atan(pos.y, pos.x);
  float radius = length(pos);
  
  // Create swirling waves
  float swirl1 = sin(angle * 3.0 + TIME * speed - radius * 2.0);
  float swirl2 = cos(angle * 2.0 - TIME * speed * 0.7 + radius * 1.5);
  float swirl3 = sin(radius * 4.0 - angle + TIME * speed * 0.5);
  
  // Combine swirls into a single value
  float pattern = (swirl1 + swirl2 + swirl3) * 0.333;
  
  // Map pattern to color ranges
  float colorMix1 = fract(pattern + TIME * speed * 0.25);
  float colorMix2 = fract(pattern - TIME * speed * 0.25);
  
  // Blend three colors based on pattern
  vec3 col = mix(colorA.rgb, colorB.rgb, smoothstep(-1.0, 1.0, swirl1));
  col = mix(col, colorC.rgb, smoothstep(-1.0, 1.0, swirl2));
  
  // Add brightness variation based on radius and time
  float brightness = 0.5 + 0.5 * sin(radius * 3.0 + TIME * speed);
  col *= brightness;
  
  gl_FragColor = vec4(col, 1.0);
}
