/*{
  "DESCRIPTION": "Gently falling snow with twinkling lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.0, 0.1, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float snowFlake(vec2 uv, vec2 center, float size) {
  float dist = length(uv - center);
  return smoothstep(size * 1.5, size * 0.3, dist);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec3 sky = skyColor.rgb;
  
  vec3 snow = vec3(0.0);
  
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    vec2 seed = vec2(fi * 0.3, fi * 0.7);
    
    float xOffset = hash(seed) * 2.0 - 1.0;
    float yPhase = mod(TIME * speed * 0.3 + hash(seed + vec2(1.0, 0.0)), 1.5);
    float y = 1.0 - yPhase;
    
    float x = fract(uv.x + xOffset + TIME * speed * 0.05);
    float twinkle = 0.5 + 0.5 * sin(TIME * 3.0 + fi * 0.5);
    float flake = snowFlake(uv, vec2(x, y), 0.02) * twinkle;
    
    snow += snowColor.rgb * flake * density;
  }
  
  vec3 final = mix(sky, snow, min(snow, 1.0));
  gl_FragColor = vec4(final, 1.0);
}
