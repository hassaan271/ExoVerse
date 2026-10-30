/**
 * GLSL for the planet engine.
 *
 * The bake shaders are expensive and run once per planet, writing a surface
 * map into a texture. PLANET_FRAGMENT is cheap and runs every frame, reading
 * those maps. That split is what keeps a detailed planet at full frame rate.
 *
 * Direct3D's shader compiler inlines and unrolls everything, so instruction
 * count decides how long a first visit waits. A single shader holding every
 * preset with gradient noise took about 20 seconds to compile on an integrated
 * GPU. Hence value noise, shallow loops, and each preset compiled on its own.
 */
const NOISE = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash(i), hash(i + vec3(1, 0, 0)), u.x),
                mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), u.x),
                mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z) * 2.0 - 1.0;
}

const mat3 TURN = mat3(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64);

float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < octaves; i++) {
    sum += amplitude * valueNoise(p);
    p = TURN * p * 2.03 + 1.7;
    amplitude *= 0.5;
  }
  return sum;
}
`;

const SPHERE_DIRECTION = /* glsl */ `
vec3 sphereDirection(vec2 uv) {
  float phi = uv.x * 6.28318530718;
  float theta = (1.0 - uv.y) * 3.14159265359;
  return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
}
`;

export const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Compiled once per preset, with PRESET set to the id in PRESET_ID. */
export const SURFACE_BAKE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform vec3 uColors[5];
${NOISE}
${SPHERE_DIRECTION}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  int index = int(min(floor(t), 3.0));
  return mix(uColors[index], uColors[index + 1], smoothstep(0.0, 1.0, t - float(index)));
}

// Returns depth in the low range and a raised rim. Three scales read as old
// terrain rather than a regular pattern.
float crater(vec3 p) {
  vec3 cell = floor(p + 0.5);
  float result = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 c = cell - vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
    float h = hash(c + 11.3);
    vec3 centre = c + 0.5 + (vec3(h, fract(h * 7.1), fract(h * 13.7)) - 0.5) * 0.6;
    float radius = mix(0.16, 0.44, fract(h * 31.3));
    float d = length(p - centre) / radius;
    float bowl = (smoothstep(0.0, 0.92, d) - 1.0) * 0.9;
    float rim = smoothstep(0.72, 0.98, d) * (1.0 - smoothstep(0.98, 1.25, d)) * 0.42;
    result += (bowl + rim) * step(h, 0.55) * (1.0 - step(1.25, d));
  }
  return result;
}

float craterField(vec3 dir, vec3 s) {
  return crater(dir * 3.2 + s) * 0.62
       + crater(dir * 7.5 + s.zxy) * 0.34
       + crater(dir * 17.0 + s.yzx) * 0.16;
}

#if PRESET == 0
vec4 surface(vec3 dir, vec3 s) {
  float warp = fbm(dir * 1.8 + s, 3);
  float land = fbm(dir * 2.2 + warp * 1.1 + s, 6);
  float ridge = 1.0 - abs(fbm(dir * 4.0 + warp + s, 4)) * 2.4;
  float detail = fbm(dir * 26.0 + s, 3);
  float craters = craterField(dir, s);
  float height = 0.5 + land * 0.7 + (ridge - 0.5) * 0.2 + detail * 0.05 + craters * 0.42;
  float regions = fbm(dir * 1.1 + s + 21.0, 2);
  vec3 color = ramp(height + regions * 0.35 + detail * 0.1);
  color *= 0.84 + 0.3 * smoothstep(-0.3, 0.3, regions);
  color = mix(color, uColors[1] * 0.75, smoothstep(0.0, -0.7, craters) * 0.6);
  return vec4(color, clamp(height, 0.0, 1.0));
}
#elif PRESET == 1 || PRESET == 2
vec4 surface(vec3 dir, vec3 s) {
  #if PRESET == 1
  float frequency = 13.0 + fract(uSeed * 7.0) * 10.0;
  float contrast = 1.0;
  #else
  float frequency = 6.0 + fract(uSeed * 7.0) * 4.0;
  float contrast = 0.55;
  #endif
  float turbulence = fbm(vec3(dir.x * 2.5, dir.y * 9.0, dir.z * 2.5) + s, 5);
  float y = dir.y + turbulence * 0.06;
  float bands = 0.5 + 0.28 * sin(y * frequency + s.x)
                    + 0.16 * sin(y * frequency * 2.3 + s.y)
                    + 0.09 * sin(y * frequency * 5.1 + s.z);
  float streaks = fbm(vec3(dir.x * 5.0, dir.y * 42.0, dir.z * 5.0) + s, 4);
  float eddies = fbm(dir * 11.0 + turbulence * 3.0 + s, 3);
  vec3 color = ramp(0.5 + (bands - 0.5) * contrast + streaks * 0.3 + eddies * 0.09);

  // One long-lived oval storm, placed by the seed, with a swirled edge.
  vec3 stormAxis = normalize(vec3(cos(s.x), (fract(s.y * 0.13) - 0.5) * 1.1, sin(s.x)));
  float d = length((dir - stormAxis) * vec3(0.7, 1.6, 0.7));
  float storm = 1.0 - smoothstep(0.09, 0.2 + eddies * 0.05, d);
  color = mix(color, uColors[4], storm * 0.75 * contrast);
  return vec4(color, 0.5 + streaks * 0.12);
}
#elif PRESET == 3
vec4 surface(vec3 dir, vec3 s) {
  float plains = fbm(dir * 2.6 + s, 5);
  float warp = fbm(dir * 3.0 + s + 2.0, 2);
  float a = abs(fbm(dir * 4.5 + warp * 1.2 + s, 5));
  float b = abs(fbm(dir * 11.0 + warp * 2.0 + s + 3.0, 4));
  float cracks = (1.0 - smoothstep(0.0, 0.03, a)) + (1.0 - smoothstep(0.0, 0.018, b)) * 0.6;
  // Cracks are colour only: lines this thin would alias as bump.
  float craters = craterField(dir, s) * 0.6;
  float height = 0.6 + plains * 0.5 + craters * 0.22;
  vec3 color = ramp(0.68 + plains * 0.7 + fbm(dir * 24.0 + s, 2) * 0.14);
  color = mix(color, uColors[0], clamp(cracks, 0.0, 1.0) * 0.72);
  return vec4(color, clamp(height, 0.0, 1.0));
}
#elif PRESET == 4
vec4 surface(vec3 dir, vec3 s) {
  float warp = fbm(dir * 2.4 + s, 3);
  float rock = fbm(dir * 3.4 + warp * 1.4 + s, 6);
  float a = abs(fbm(dir * 3.2 + warp * 1.8 + s + 1.0, 5));
  float b = abs(fbm(dir * 8.5 + warp * 2.2 + s + 8.0, 4));
  float cracks = max(1.0 - smoothstep(0.0, 0.06, a), (1.0 - smoothstep(0.0, 0.035, b)) * 0.75);
  float molten = max(cracks, smoothstep(0.26, 0.42, -rock));
  float height = mix(0.42 + rock * 0.6, 0.02, smoothstep(0.0, 1.0, molten));
  return vec4(ramp(0.42 + rock * 0.9 + fbm(dir * 22.0 + s, 2) * 0.14), clamp(height, 0.0, 1.0));
}
#elif PRESET == 6
// Earth is the only world where oceans are a fact, not an inference.
vec4 surface(vec3 dir, vec3 s) {
  float warp = fbm(dir * 1.7 + s, 3);
  float land = fbm(dir * 1.9 + warp * 1.2 + s, 6) + 0.02;
  float shore = smoothstep(0.0, 0.03, land);
  vec3 ground = mix(uColors[2], uColors[3], smoothstep(0.05, 0.3, land + fbm(dir * 9.0 + s, 3) * 0.3));
  vec3 color = mix(mix(uColors[0], uColors[1], smoothstep(-0.25, 0.0, land)), ground, shore);
  float ice = smoothstep(0.78, 0.86, abs(dir.y) + warp * 0.12);
  color = mix(color, uColors[4], ice);
  return vec4(color, 0.5 + shore * (land * 0.5 + 0.05));
}
#else
vec4 surface(vec3 dir, vec3 s) {
  float swell = fbm(dir * 2.4 + fbm(dir * 2.0 + s, 3) * 1.6 + s, 6);
  float grain = fbm(dir * 18.0 + s, 3);
  float height = 0.5 + swell * 0.55 + grain * 0.06 + craterField(dir, s) * 0.06;
  return vec4(ramp(0.5 + swell * 0.85 + grain * 0.16), clamp(height, 0.0, 1.0));
}
#endif

void main() {
  vec3 s = vec3(uSeed * 71.0, uSeed * 137.0, uSeed * 211.0);
  vec4 result = surface(sphereDirection(vUv), s);
  // Stored gamma-encoded so dark colours keep their precision in 8 bits.
  gl_FragColor = vec4(pow(clamp(result.rgb, 0.0, 1.0), vec3(1.0 / 2.2)), result.a);
}
`;

export const CLOUD_BAKE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform float uStretch;
${NOISE}
${SPHERE_DIRECTION}

void main() {
  vec3 dir = sphereDirection(vUv);
  vec3 s = vec3(uSeed * 53.0, uSeed * 97.0, uSeed * 31.0) + 40.0;
  vec3 p = vec3(dir.x, dir.y * uStretch, dir.z);
  float warp = fbm(p * 2.0 + s, 3);
  float cover = fbm(p * 3.2 + warp * 1.8 + s, 5);
  float wisps = fbm(p * 12.0 + warp * 3.0 + s, 3);
  float value = smoothstep(0.02, 0.4, cover + wisps * 0.18);
  gl_FragColor = vec4(value, value, value, 1.0);
}
`;

export const PLANET_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vObjectNormal;
varying vec3 vToCamera;
void main() {
  vUv = uv;
  vObjectNormal = position;
  // modelViewMatrix is computed on the CPU in double precision, so an
  // Earth-sized planet stays stable far from the scene origin.
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vToCamera = -view.xyz;
  gl_Position = projectionMatrix * view;
}
`;

export const PLANET_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vObjectNormal;
varying vec3 vToCamera;
uniform mat4 modelMatrix;
uniform sampler2D uSurface;
uniform sampler2D uClouds;
uniform vec2 uTexel;
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAtmosphere;
uniform vec3 uCloudColor;
uniform float uAtmosphereStrength;
uniform float uBump;
uniform float uSpecular;
uniform float uLava;
uniform float uCloudAmount;
uniform float uCloudShift;

void main() {
  vec4 surface = texture2D(uSurface, vUv);
  float dHdU = texture2D(uSurface, vUv + vec2(uTexel.x, 0.0)).a - texture2D(uSurface, vUv - vec2(uTexel.x, 0.0)).a;
  float dHdV = texture2D(uSurface, vUv + vec2(0.0, uTexel.y)).a - texture2D(uSurface, vUv - vec2(0.0, uTexel.y)).a;

  vec3 sphereNormal = normalize(vObjectNormal);
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), sphereNormal) + vec3(1e-5));
  vec3 bitangent = cross(sphereNormal, tangent);
  vec3 bumped = normalize(sphereNormal - uBump * (dHdU * tangent + dHdV * bitangent));

  mat3 toWorld = mat3(modelMatrix);
  vec3 N = normalize(toWorld * bumped);
  vec3 smoothN = normalize(toWorld * sphereNormal);
  vec3 L = uLightDirection;
  vec3 V = normalize(transpose(mat3(viewMatrix)) * vToCamera);

  float sunAngle = dot(smoothN, L);
  float terminator = smoothstep(-0.14, 0.2, sunAngle);
  float diffuse = max(dot(N, L), 0.0) * terminator;

  vec3 lightInObject = transpose(toWorld) * L;
  vec2 cloudUv = vUv + vec2(uCloudShift, 0.0);
  float cloud = texture2D(uClouds, cloudUv).r * uCloudAmount;
  vec2 shadowShift = vec2(dot(lightInObject, tangent), dot(lightInObject, bitangent)) * 0.008;
  float cloudShadow = texture2D(uClouds, cloudUv + shadowShift).r * uCloudAmount;

  vec3 albedo = pow(surface.rgb, vec3(2.2));
  vec3 color = albedo * (diffuse * (1.0 - cloudShadow * 0.65) * uLightColor * 2.3 + vec3(0.006, 0.007, 0.012));

  vec3 halfway = normalize(L + V);
  float specular = pow(max(dot(N, halfway), 0.0), 48.0) * uSpecular * terminator;
  color += specular * uLightColor;

  color = mix(color, uCloudColor * (terminator * max(sunAngle, 0.0) * 2.1 * uLightColor + 0.004), cloud);

  // Warm tint in the narrow band where sunlight crosses the most air.
  float dusk = smoothstep(-0.16, 0.05, sunAngle) * (1.0 - smoothstep(0.05, 0.3, sunAngle));
  color += uAtmosphere * vec3(1.0, 0.72, 0.5) * dusk * 0.05 * uAtmosphereStrength;

  float fresnel = pow(1.0 - max(dot(smoothN, V), 0.0), 3.2);
  color += uAtmosphere * uLightColor * fresnel * smoothstep(-0.25, 0.45, sunAngle) * uAtmosphereStrength * 0.9;

  float molten = (1.0 - smoothstep(0.03, 0.2, surface.a)) * uLava;
  color = mix(color, vec3(2.6, 0.72, 0.1) * (0.75 + 0.5 * surface.a * 5.0), molten);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vToCamera;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vToCamera = -view.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * view;
}
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorldNormal;
varying vec3 vToCamera;
uniform vec3 uAtmosphere;
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform float uAtmosphereStrength;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(transpose(mat3(viewMatrix)) * vToCamera);
  // Viewed from inside the back faces: zero at the shell's outer edge.
  float depth = clamp(-dot(N, V), 0.0, 1.0);
  float falloff = pow(depth, 1.7);
  float lit = smoothstep(-0.3, 0.55, dot(N, uLightDirection));
  gl_FragColor = vec4(uAtmosphere * uLightColor * falloff * lit * uAtmosphereStrength * 2.2, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
