/*{
  "DESCRIPTION": "Random sparkles twinkling over a solid color background",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "baseColor", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.0, 1.0] },
    { "NAME": "sparkleColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "density", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.1 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float sparkle(vec2 uv, float t) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  
  float h = hash(i + vec2(sin(t * speed * 0.5), cos(t * speed * 0.3)));
  
  if (h < density) {
    float twinkle = abs(sin(t * speed * 3.14159));
    twinkle *= smoothstep(0.7, 0.0, length(f - vec2(0.5)));
    return twinkle;
  }
  
  return 0.0;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 scaled = uv * 16.0;
  
  float spark = sparkle(scaled, TIME);
  
  vec3 color = mix(baseColor.rgb, sparkleColor.rgb, spark);
  
  gl_FragColor = vec4(color, 1.0);
}
