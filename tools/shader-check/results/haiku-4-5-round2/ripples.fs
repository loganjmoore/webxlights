/*{
  "DESCRIPTION": "Raindrops falling and creating expanding circular ripples on a surface",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.8, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Make the effect horizontal for thin displays
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  if (RENDERSIZE.y < 2.0) {
    uv.y = 0.5;
  }
  
  vec3 col = vec3(0.0);
  
  // Create multiple raindrop centers at different times
  for (int i = 0; i < 12; i++) {
    float idx = float(i);
    
    // Staggered raindrop positions and timings
    float dropX = fract(idx * 0.083 + TIME * speed * 0.1);
    float dropY = fract(idx * 0.167 - TIME * speed * 0.15);
    
    vec2 dropPos = vec2(dropX, dropY);
    float dist = length(uv - dropPos);
    
    // Ripple wave: expands outward and fades
    float rippleTime = fract((TIME * speed * 0.5) + idx * 0.2);
    float rippleRadius = rippleTime * scale * 0.15;
    float rippleWidth = 0.04;
    
    // Distance from the expanding circle
    float wave = sin((dist - rippleRadius) * 20.0) * exp(-abs(dist - rippleRadius) * 8.0);
    wave *= smoothstep(1.0, -0.2, rippleTime);
    
    // Add brightness at the raindrop center
    float core = exp(-dist * dist * 25.0) * (1.0 - rippleTime);
    
    float intensity = max(wave, core * 0.5);
    col += mix(colorA.rgb, colorB.rgb, rippleTime) * intensity;
  }
  
  // Normalize and add slight glow
  col = clamp(col, 0.0, 1.0);
  col += vec3(0.1, 0.2, 0.3) * 0.15;
  
  gl_FragColor = vec4(col, 1.0);
}
