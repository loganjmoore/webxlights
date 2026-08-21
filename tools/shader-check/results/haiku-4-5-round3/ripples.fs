/*{
  "DESCRIPTION": "Raindrops falling and creating expanding ripples on a wet surface",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.8, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 5.0 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec3 col = vec3(0.0);
  
  float t = TIME * speed;
  
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    vec2 gridPos = floor(uv * density) + vec2(mod(fi, 4.0), floor(fi / 4.0)) * 0.25;
    float seed = hash(gridPos);
    
    float dropTime = mod(t + seed * 6.283, 3.0);
    float fallPhase = mod(t * 0.5 + seed * 10.0, 2.0);
    
    vec2 dropCenter = gridPos + vec2(hash(gridPos + 1.1), hash(gridPos + 2.2)) * 0.1;
    dropCenter = mod(dropCenter, 1.0 / density);
    dropCenter /= density;
    
    float dist = length(uv - dropCenter);
    
    float ripple = sin(dist * 40.0 - dropTime * 8.0) * 0.5 + 0.5;
    ripple *= exp(-dist * 3.0 - dropTime * 2.0);
    ripple *= smoothstep(-0.1, 0.0, 1.5 - dropTime);
    
    float dropBright = smoothstep(0.02, 0.0, dist) * smoothstep(0.5, 0.0, fallPhase);
    
    col += mix(colorA.rgb, colorB.rgb, 0.5) * ripple * 0.6;
    col += colorB.rgb * dropBright * 0.8;
  }
  
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
