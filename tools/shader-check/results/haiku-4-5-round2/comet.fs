/*{
  "DESCRIPTION": "A bright comet orbits in a circle leaving a fading tail behind it",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "cometColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.5, 1.0] },
    { "NAME": "tailColor", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.3, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 center = vec2(0.5, 0.5);
  vec2 uv = isf_FragNormCoord;
  
  // Orbit radius
  float radius = 0.35 * scale;
  
  // Comet position along orbit
  float angle = TIME * speed * 2.0;
  vec2 cometPos = center + vec2(cos(angle), sin(angle)) * radius;
  
  // Distance from current pixel to comet head
  float distToComet = length(uv - cometPos);
  
  // Comet head glow
  float cometGlow = exp(-distToComet * 25.0) * 0.8;
  
  // Tail: trace backwards along the orbit
  float tailIntensity = 0.0;
  for (int i = 1; i <= 16; i++) {
    float traceAngle = angle - float(i) * 0.15 * tailLength;
    vec2 tailPos = center + vec2(cos(traceAngle), sin(traceAngle)) * radius;
    float distToTail = length(uv - tailPos);
    float fade = exp(-float(i) * 0.3);
    tailIntensity += exp(-distToTail * 15.0) * fade;
  }
  tailIntensity *= 0.5;
  
  // Blend comet head and tail
  vec3 color = mix(tailColor.rgb, cometColor.rgb, cometGlow / (cometGlow + tailIntensity + 0.01));
  float intensity = cometGlow + tailIntensity;
  
  gl_FragColor = vec4(color * intensity, 1.0);
}
