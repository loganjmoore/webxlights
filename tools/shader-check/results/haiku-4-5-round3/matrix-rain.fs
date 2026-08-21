/*{
  "DESCRIPTION": "Green digital rain streaks falling down the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 },
    { "NAME": "trailLength", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/

float hash(float n) {
  return fract(sin(n * 43758.5453123) * 12.9898);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Adapt for very short displays (roofline)
  vec2 coord = uv;
  if (RENDERSIZE.y < 2.0) {
    coord = vec2(uv.y, uv.x);
  }
  
  // Vertical streaks with horizontal variation
  float streakX = floor(coord.x * density * 8.0) / 8.0;
  float streakSeed = hash(streakX);
  
  // Falling animation
  float fallPos = mod(coord.y + TIME * speed * 0.5 + streakSeed * 2.0, 1.0);
  
  // Trail effect - bright at top of streak, fading down
  float distFromTop = fallPos;
  float trail = smoothstep(trailLength, 0.0, distFromTop);
  
  // Add some flicker variation along the trail
  float flicker = 0.7 + 0.3 * sin(TIME * 4.0 + streakSeed * 6.28);
  
  // Random brightness variation per streak
  float brightness = hash(streakSeed * 2.0) * 0.6 + 0.4;
  
  // Green with intensity based on trail
  float intensity = trail * brightness * flicker;
  vec3 rainColor = vec3(0.0, 1.0, 0.3) * intensity;
  
  gl_FragColor = vec4(rainColor, 1.0);
}
