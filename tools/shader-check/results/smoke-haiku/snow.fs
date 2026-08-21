/*{
  "DESCRIPTION": "Gently falling snow with twinkling lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.2, 1.0] },
    { "NAME": "fallSpeed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 }
  ]
}*/

float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float snowflake(vec2 uv, float time) {
  vec2 id = floor(uv * density * 8.0);
  vec2 pos = fract(uv * density * 8.0);
  
  float seed = hash(id);
  float fallOffset = mod(time * fallSpeed * 0.3 + seed * 10.0, 2.0);
  
  float y = fract(pos.y + fallOffset);
  float x = pos.x + sin(y * 6.28318 + seed * 6.28318) * 0.15;
  
  float dx = abs(fract(x) - 0.5);
  float dy = abs(y - 0.5);
  
  float dist = length(vec2(dx, dy));
  float flake = smoothstep(0.12, 0.02, dist);
  
  float twinkle = 0.5 + 0.5 * sin(time * 2.0 + seed * 6.28318);
  flake *= mix(0.4, 1.0, twinkle);
  
  return flake;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float snow = 0.0;
  for (int i = 0; i < 3; i++) {
    snow += snowflake(uv + vec2(0.0, float(i) * 0.33), TIME) * 0.6;
  }
  
  snow = min(snow, 1.0);
  
  vec3 finalColor = mix(skyColor.rgb, snowColor.rgb, snow);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
