/*{
  "DESCRIPTION": "Slow lava lamp blobs flowing and morphing in mesmerizing patterns",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.3 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 }
  ]
}*/

float noise(vec2 p) {
  return fract(sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float n00 = noise(i);
  float n10 = noise(i + vec2(1.0, 0.0));
  float n01 = noise(i + vec2(0.0, 1.0));
  float n11 = noise(i + vec2(1.0, 1.0));
  
  float nx0 = mix(n00, n10, f.x);
  float nx1 = mix(n01, n11, f.x);
  return mix(nx0, nx1, f.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float t = TIME * speed;
  
  vec2 p = uv * scale;
  p.x += sin(t * 0.4) * 0.3;
  p.y += cos(t * 0.3) * 0.3;
  
  float blob1 = smoothNoise(p + vec2(t * 0.2, sin(t * 0.15) * 0.2));
  float blob2 = smoothNoise(p + vec2(cos(t * 0.25) * 0.3, t * 0.15));
  float blob3 = smoothNoise(p * 0.7 + vec2(sin(t * 0.35) * 0.4, cos(t * 0.2) * 0.3));
  
  float combined = blob1 * 0.4 + blob2 * 0.35 + blob3 * 0.25;
  combined = smoothstep(0.3, 0.7, combined);
  
  float flow = fract(uv.y - t * 0.1);
  combined *= mix(0.7, 1.0, smoothstep(0.0, 0.5, flow) * smoothstep(1.0, 0.5, flow));
  
  vec3 color = mix(colorA.rgb, colorB.rgb, sin(t * 0.2 + uv.y * 3.0) * 0.5 + 0.5);
  color *= combined;
  
  gl_FragColor = vec4(color, 1.0);
}
