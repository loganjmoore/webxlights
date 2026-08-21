/*{
  "DESCRIPTION": "Gently falling snow with twinkling lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "bgColor", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.2, 1.0] },
    { "NAME": "fallSpeed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float snowflake(vec2 uv, float time) {
  vec2 p = uv * 12.0;
  vec2 i = floor(p);
  vec2 f = fract(p);
  
  float h = hash(i + vec2(137.0, 241.0));
  float yOffset = fract(time * fallSpeed * 0.3 + h);
  
  float dy = fract(f.y + yOffset);
  float dx = fract(f.x + sin(h * 6.28) * 0.1);
  
  float d = length(vec2(dx - 0.5, dy - 0.5));
  float flake = smoothstep(0.35, 0.0, d);
  
  float twinkle = 0.5 + 0.5 * sin(TIME * 3.0 + h * 6.28);
  return flake * (0.6 + 0.4 * twinkle);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  vec3 bg = bgColor.rgb;
  
  float snow = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 offset = vec2(float(i) * 0.25, 0.0);
    snow += snowflake(uv + offset, TIME) * density;
  }
  
  snow = min(1.0, snow);
  
  vec3 color = mix(bg, snowColor.rgb, snow * 0.9);
  
  gl_FragColor = vec4(color, 1.0);
}
